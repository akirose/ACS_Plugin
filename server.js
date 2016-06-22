const _ = require('lodash')
	, low = require('lowdb')
	, storage = require('lowdb/lib/file-sync')
	, fs = require('fs')
	, child_process = require('child_process')
	, debug = require('debug')('acs-main:debug')
	, info = require('debug')('acs-main:info');

var plugins = {};

const config = low('config.json', {storage});
const db = low('data.json', {storage});

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
						var filtered = db.get('drivers')
											.filter({ guid: driver_info.guid })
											.size().value();
						if(filtered > 0) {
							if(filtered == 1) {
								driver_info = db.get('drivers').find({ guid: driver_info.guid }).assign(driver_info).value();
							} else {
								db.get('drivers').remove({ guid: driver_info.guid });
								filtered = 0;
							}
						}

						if(filtered == 0) {
							driver_info = _.assign(driver_info, { ballast : 0 });
							db.get('drivers').push(driver_info);
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


/*
// Process SIGNAL Event Listening
process.on('SIGINT', function() {
	process.exit();
});

// Http server listening on port 3000
setup.server.listen(3000, function() {
	console.log("setup is running at port (3000)");
});

// Event listeners for communication between ACS plug-in and web ui.
setup.on('run-plugin', function() {
	var stat = fs.statSync('config.json');
	if(!stat.isFile()) {
		return;
	}

	var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
	for(var i = 0; i < config.plugins.length; i++) {
		var child = child_process.fork("plugin.js", [i]);
		child.on('exit', function(code, signal) {
			console.log("Stop ACS Plug-in (PID : " + this.pid + ", Code : " + code + ", Signal : " + signal + " )");

			var plugin_keys = Object.keys(plugins);
			for(var i = 0; i < plugin_keys.length; i++) {
				if(plugins[plugin_keys[i]].process.pid === this.pid) {
					delete plugins[plugin_keys[i]];
					setup.io.of("/monitor").emit('get_closed_plugin', this.pid);
					console.log("Remove Plug-in (PID : " + this.pid + ") in Running List.");
					break;
				}
			}
		}).on('error', function(error) {
			console.log(error);
		}).on('message', _handle_message);

		plugins[i] = { index: i, process : child };
	}

	setup.emit('get-running-plugins');
}).on('stop-plugin', function() {
	var plugin_keys = Object.keys(plugins);

	for(var i = 0; i < plugin_keys.length; i++) {
		var plugin = plugins[plugin_keys[i]];
		plugin.process.kill('SIGTERM');
	}
}).on('send-plugin', function(plugin_idx, msg) {
	if(typeof plugins[plugin_idx] === 'object' && typeof msg === 'object' && typeof msg.command === 'string') { 
		plugins[plugin_idx].process.send(msg);
	}
}).on('get-running-plugins', function(socketid) {
	var arr = [];
	var plugin_keys = Object.keys(plugins);
	for(var i = 0; i < plugin_keys.length; i++) {
		var plugin = plugins[plugin_keys[i]];

		arr.push({ index: i, pid: plugin.process.pid });
	}

	if(typeof socketid === 'undefined') {
		setup.io.of("/monitor").emit('get_running_plugin_list', arr);
	} else {
		setup.io.of("/monitor").to(socketid).emit('get_running_plugin_list', arr);
	}
});

function _handle_message(msg) {
	if(typeof msg !== 'object' || typeof msg.command === 'undefined') {
		return;
	}

	switch(msg.command) {
		case "add_driver":
			var car_info = msg.data;
			var driver = db('drivers').find({ guid: car_info.guid });
			if(typeof driver === 'undefined') {
				db('drivers').push({ name: car_info.name, guid: car_info.guid, ballast: 0 });
			}
		break;
		case "driver_info":
			var driver = msg.data;
			var driver_info = db('drivers').find({ guid: driver.guid });
			if(typeof driver_info !== 'undefined') {
				this.send({ command: 'driver_info', data: driver_info });
			}
		case "monitor":
			if(typeof msg.id === 'undefined') {
				setup.io.of("/monitor").emit(msg.monitor_command, { pid: this.pid, data: msg.data });
			} else {
				setup.io.of("/monitor").to(msg.id).emit(msg.monitor_command, { pid: this.pid, data: msg.data});
			}
		break;
	}
}
*/