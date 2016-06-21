const acsp = require('./acsp.js')
	, _ = require('lodash')
	, Promise = require('bluebird')
	, EventEmitter = require('events').EventEmitter
	, util = require('util')
	, debug = require('debug')('acs-plugin:debug-' + process.pid)
	, info = require('debug')('acs-plugin:info-' + process.pid)
	, io = require('socket.io-client')
	, monitor = require('./plugin-monitor.js');

var plugin = function(options) {
	var self = this;

	this.options = options;
	this.acsp = acsp(options);

	this.cars = {};

	// Connect to monitor socket
	this.monitor = io('http://localhost:' + options.monitor_port + '/monitor');

	this.acsp.once('listening', function() {
		info('ACS Plug-in listening on port %d (ACServer : %s:%d)', this.options.listen_port, this.options.server_host, this.options.server_port);

		// Attach monitor socket handlers
		_.forEach(monitor(self, debug, info), function(value, key) {
			debug('Attach event listener \'%s\' to monitor socket.', key);
			self.monitor.on(key, value);
		});

		global.timer = function(callback) {
			callback();
			return setInterval(callback, 3000);
		}(function() {
			self.acsp.getSessionInfo().then(function(session_info) {
				if(typeof global.timer === 'object') {
					clearInterval(global.timer);
					delete global.timer;
				}

				var i = 0;
				handler = function(car_info) {
						i++;
						if(car_info.isConnected == true) {
							self.cars[car_info.car_id] = car_info;
							process.send({ command: 'add_driver_info', data: { name: car_info.driver_name, guid: car_info.driver_guid } });

							self._ballast(car_info.car_id);
							self.monitor.emit('car_info', car_info);
						}
						self.acsp.getCarInfo(i).then(handler, function(e) { self._bind(); });
					}
				self.acsp.getCarInfo(i).then(handler, function(e) { self._bind(); });
			}, function(error) {});
		});
	});

	this.acsp.on('version', function(version) {
		if(typeof global.timer === 'object') {
			clearInterval(global.timer);
			delete global.timer;
		}

		info('Protocol version : %d', version);

		self.cars = {};
		self._bind();
	});

	this._bind = function() {
		var self = this;
		_.forEach(plugin.prototype, function(callback, key) {
			if(!key.startsWith('_')) {
				self.acsp.on(key, function() { callback.apply(self, arguments) });
			}
		});
	}	
}

plugin.prototype.session_info = function(session_info) {
}

// New client connected.
plugin.prototype.new_connection = function(car_info) {
	this.cars[car_info.car_id] = car_info;
	process.send({ command: 'add_driver_info', data: { name: car_info.driver_name, guid: car_info.driver_guid } });

	this.monitor.emit('new_connection', car_info);
}

// Get loading complete of client.
plugin.prototype.client_loaded = function(car_id) {
	var self = this;

	if(!_.has(this.cars, car_id)) {
		this.acsp.getCarInfo(car_id).then(function(car_info) {
			self._welcome_message(car_id);
			self._ballast(car_id);
		}, function(error) {});

		return true;
	}
	var car_info = this.cars[car_id];

	this._welcome_message(car_id);
	this._ballast(car_id).then(function(driver_info) {
		var message = driver_info.name + ' is applied to weight penalty ' + driver_info.ballast + 'kg.';
		self.acsp.sendChat(car_id, message);
		self.monitor.emit('chat', message, 'info');
	});

	this.monitor.emit('car_info', car_info);
}

// (private) Send welcome message to client.
plugin.prototype._welcome_message = function(car_id) {
	_.forEach(this.options.welcome_message, function(message, key) {
		this.acsp.sendChat(car_id, message);
	});
}

// (private) Applying a weight penalty.
plugin.prototype._ballast = function(car_id) {
	var self = this;
	var car_info = this.cars[car_id];
	process.send({ command: 'driver_info', data: car_info.guid });

	return new Promise(function(resolve, reject) {
		handler = function(driver_info) {
			if(driver_info.guid === car_info.guid) {
				resolve(driver_info);
				process.removeListener('message', handler);
			}
		}
		process.on('message', handler);
	}).timeout(1000)
	.then(function(driver_info) {
		if(driver_info.ballast > 0) {
			self.acsp.adminCommand('/ballast ' + car_id + ' ' + driver_info.ballast);
		}
	}, function(error) {})
	.finally(function() {
		process.removeListener('message', handler);
	});
}

// Internal process communication
var _instance;
process.on('message', function(message) {
	if(typeof message !== 'object' || typeof message.command !== 'string') return;

	switch(message.command) {
		case "start_plugin":
			if(typeof message.options === 'object') {
				_instance = new plugin(message.options);
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