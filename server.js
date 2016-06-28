const _ = require('lodash')
	, low = require('lowdb')
	, fs = require('fs')
	, child_process = require('child_process')
	, debug = require('debug')('acs-main:debug')
	, info = require('debug')('acs-main:info');

var plugins = {};

var config = low('config.json', {storage: require('lowdb/lib/file-sync')});
var db = low('data.json', {storage: require('lowdb/lib/file-sync')});
db.defaults({ drivers: [] }).value();

/* Run http server */
var http_listen_port = (config.get('http_listen_port').cloneDeep().value() || 3000);
var webServer = (function httpServer(port, _handle_http_server) {
	return child_process.fork("httpserver.js", [port])
		.on("message", _handle_http_server)
		.on("exit", (code, signal) => {
			info("Restarting Http Server");
			webServer = httpServer(port, _handle_http_server);
		});
})((http_listen_port || 3000), function(message) {
	if(typeof message !== 'object' || typeof message.command !== 'string') return;

	switch(message.command) {
		case "start_plugin":
			info("Run ACS Plug-in");
			start_plugin();
		break;
		case "stop_plugin":
			info("Stop ACS Plug-in");
			stop_plugin();
		break;
		case "config":
			info("Update ACSP Config");
			_.forEach(message.config, function(conf, key) {
				config.set(key, conf).value();
			});
		break;
		default:
			debug("Unknown command : %s", message.command);
		break;
	}
});

var start_plugin = function() {
	// plugins are already running.
	if(_.keys(plugins).length > 0) {
		return;
	}

	var event_config = { 
		title : config.get('event_title').cloneDeep().value(),
		welcome_message : (config.get('welcome_message').cloneDeep().value() || '').split('\n')
	};

	var pconfs = config.get('plugins').cloneDeep().value();
	for(var i in pconfs) {
		var plugin_config = pconfs[i];
		plugin_config.monitor_port = http_listen_port;
		plugin_config.event_title = event_config.title;
		plugin_config.welcome_message = _.cloneDeep(event_config.welcome_message)
											.concat(plugin_config.welcome_message.split('\n'))
											.filter(function(value) { return value.trim() !== ''; })
											.map(function(value) { return value.trim(); });
		launch_plugin(plugin_config);
	}
};

var launch_plugin = function(options) {
	var plugin = child_process.fork('plugin.js')
			.on('message', function(message) {
				if(typeof message !== 'object' || typeof message.command !== 'string') return;

				switch(message.command) {
					case "add_driver_info":
						var driver_info = message.data;
						var find = db.get('drivers').find({ guid: driver_info.guid }).value();
						console.log(find);
						if(typeof find === 'undefined') {
							driver_info = _.assign(driver_info, { ballast: 0 });
							db.get('drivers').push(driver_info).value();
						} else {
							driver_info = db.get('drivers').find({ guid: driver_info.guid }).assign(driver_info).value();
						}
					break;
					case "driver_info":
						var guid = message.data;
						var driver_info = db.get('drivers').find({ guid: guid }).value();
						this.send({ command: 'driver_info', data: driver_info });
					break;
				}
			})
			.on('exit', function(code, signal) {
				info("Plug-in process closed. (PID : %s, Code : %d, Signal : %s)", this.pid, code, signal);
				if(Number(code) > 0) {
					info("Abnormal plug-in termination. Relaunch an application.");
					var plugin = plugins[this.pid];
					launch_plugin(_.cloneDeep(plugin.options));
				}
				delete plugins[this.pid];
			});
	plugin.send({ command: 'start_plugin', options: options });
	plugins[plugin.pid] = { options: options, process: plugin };
	info("Plug-in running on PID (%d)", plugin.pid);

	return plugin;
}

var stop_plugin = function() {
	var pids = Object.keys(plugins);
	for(var pid in pids) {
		var plugin = plugins[pids[pid]];
		plugin.process.kill('SIGTERM');
	}
}

// Process SIGNAL Event Listening
process.on('SIGINT', function() {
	process.exit();
});
