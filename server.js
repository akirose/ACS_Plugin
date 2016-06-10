const _ = require('lodash');
const low = require('lowdb');
const storage = require('lowdb/file-sync');
const fs = require('fs');
const child_process = require('child_process');
const setup = require('./setup/setup.js');

const db = low('data.json', {storage});

var plugin_childs = [];

// Process SIGNAL Event Listening
process.on('SIGINT', function() {
	process.exit();
});

setup.listen(3000, function() {
	console.log("setup is running at port (3000)");
});

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
		plugin_childs.push(child);
	}
}).on('stop-plugin', function() {
	for(var i = 0; i < plugin_childs.length; i++) {
		var child = plugin_childs[i];
		child.kill('SIGTERM');
	}

	plugin_childs = [];
});

function _handle_message(msg) {
	if(typeof msg !== 'object' || typeof msg.command === 'undefined') {
		return;
	}

	if(msg.command == "add_driver") {
		var car_info = msg.data;
		var driver = db('drivers').find({ guid: car_info.guid });
		if(typeof driver === 'undefined') {
			db('drivers').push({ name: car_info.name, guid: car_info.guid, ballast: 0 });
		}
	} else if(msg.command == "driver_info") {
		var driver = msg.data;
		var driver_info = db('drivers').find({ guid: driver.guid });
		if(typeof driver_info !== 'undefined') {
			this.send({ command: 'driver_info', data: driver_info });
		}
	}
}