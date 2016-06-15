const _ = require('lodash')
	, low = require('lowdb')
	, storage = require('lowdb/file-sync')
	, fs = require('fs')
	, child_process = require('child_process')
	, debug = require('debug')('acsplugin:debug')
	, info = require('debug')('acsplugin:info');

var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
var plugins = {};

const db = low('data.json', {storage});

/* Run http server */
var webServer = (function httpServer(port, _handle_http_server) {
	return child_process.fork("httpserver.js", [port])
		.on("message", _handle_http_server)
		.on("exit", (code, signal) => {
			info("Restarting Http Server");
			webServer = httpServer(port, _handle_http_server);
		});
})((config.http_listen_port || 3000), (message) => {
	if(typeof message !== 'object' || typeof message.command !== 'string') return;

	switch(message.command) {
		case "start-plugin":
			info("Run ACS Plug-in");
		break;
		case "stop-plugin":
			info("Stop ACS Plug-in");
		break;
		default:
			debug("Unknown command : %s", message.command);
		break;
	}
});

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