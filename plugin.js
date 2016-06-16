const acsp = require('./acsp.js')
	, _ = require('lodash')
	, Promise = require('bluebird')
	, EventEmitter = require('events').EventEmitter
	, util = require('util')
	, debug = require('debug')('acs-plugin:debug-' + process.pid)
	, info = require('debug')('acs-plugin:info-' + process.pid);

var plugin = function(options) {
	var self = this;

	this.acsp = acsp(options);
	this.acsp.once('listening', function() {
		global.timer = setInterval(function() {
			acsp.getSessionInfo().then(function(session_info) {
				var session_count = 0;
				var i = 0;
				handler = function(car_info) {
						if(car_info.isConnected == true) {
							session_count++;
						}
						i++;
						acsp.getCarInfo(i).then(handler, function(e) {});
					}
				acsp.getCarInfo(i).then(handler, function(e) {});

				if(session_count > 0) {
					info(session_count + " sessions are already connected.");
				}
			}, function(e) {});
		}, 3000);
	});
	this.acsp.on('version', function(version) {

	});
}

// allow emit events
util.inherits(plugin, EventEmitter);

// Internal process communication
process.on('message', function(message) {
	if(typeof message !== 'object' || typeof message.command !== 'string') return;

	switch(message.command) {
		case "start-plugin":
			if(typeof message.options === 'object') {
				new plugin(message.options);
			}
		break;
	}
});

// Process SIGNAL Event Listening
process.on('SIGTERM', function() {
	console.log("Stop ACS Plug-in.");
	process.exit();
});

/*
global.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

var welcome_message = [];
var wmArr = config.welcome_message.split("\n");
for(var idx in wmArr) {
	welcome_message.push(wmArr[idx].trim());
}

var plugin_config = config.plugins[process.argv[2]];
wmArr = plugin_config.welcome_message.split("\n");
for(var idx in wmArr) {
	welcome_message.push(wmArr[idx].trim());
}
config.welcome_message = welcome_message;

// Assetto Corsa Server Protocol
var ac = acsp(plugin_config);
ac.setMaxListeners(0);

// ACCC Plug-in
var plugin = accc(ac);

ac.once('listening', function() {
	plugin.init();
	ac.emit('listening');

	console.log("ACS Plug-in Running (PID : " + process.pid + ")");
}).on('error', function(e) {
});
*/