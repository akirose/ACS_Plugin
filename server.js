const _ = require('lodash');
const low = require('lowdb');
const storage = require('lowdb/file-sync');
const fs = require('fs');
const child_process = require('child_process');
const setup = require('./setup/setup.js');

const db = low('data.json', {storage});

var plugins = {};

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
			console.log("Stop ACS Plug-in (PID : " + this.pid + " )");
		}).on('message', _handle_message);
		plugins[i] = { index: i, process : child };
	}
}).on('stop-plugin', function() {
	var plugin_keys = Object.keys(plugins);

	for(var i = 0; i < plugin_keys.length; i++) {
		var plugin = plugins[plugin_keys[i]];
		plugin.process.kill('SIGTERM');

		delete plugins[plugin_keys[i]];
	}
}).on('send-plugin', function(plugin_idx, msg) {
	if(typeof plugins[plugin_idx] === 'object' && typeof msg === 'object' && typeof msg.command === 'string') { 
		plugins[plugin_idx].process.send(msg);
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
			console.log(msg);
			setup.io.of("/monitor").to(msg.id).emit(msg.monitor_command, msg.data);
			//setup.io.of("/monitor").emit(msg.monitor_command, msg.data);
		break;
	}
}