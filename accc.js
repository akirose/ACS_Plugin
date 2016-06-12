const _ = require('lodash');
const Promise = require('bluebird');
const EventEmitter = require('events').EventEmitter;
const util = require('util');

var drivers = {};
var current_session_info = {};

var plugin = function(acsp) {
	var self = this;

	this.acsp = acsp;
	this._handler = {
		/* Listening */
		listening: function() {
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

					// Bind all handlers.
					self.bind();

					if(session_count > 0) {
						console.log("* " + session_count + " sessions are already connected.");
					}
				}, function(e) {});
			}, 5000);
		},
		/* ACSP Version */
		version: function(version) {
			console.log("* Protocol version is " + version);

			process.send({msg:"Hello World!?"});

			// Bind all handlers.
			self.bind();
		},
		/* ACSP Session Info */
		session_info: function(session_info) {
			if(typeof global.timer === 'object') {
				clearInterval(global.timer);
				delete global.timer;
			}

			// Set Plug-in to Assetto Corsa Server Admin
			// this.adminCommand("/admin " + global.config.server_admin_password);

			// Set current session information to global variable
			current_session_info = session_info;

			console.log("* Current session information");
			console.log(session_info);
		},
		/* New connection */
		new_connection: function(car_info) {
			// Add Driver information to data.json on parent process.
			process.send({ command: 'add_driver', data : { name: car_info.driver_name, guid: car_info.driver_guid }});

			drivers[car_info.car_id] = car_info;

			console.log("** New Connection");
			console.log(car_info);
		},
		/* Client loaded */
		client_loaded: function(car_id) {
			/* Send welcome message to private chat */
			if(typeof global.config.welcome_message != 'undefined') {
				for(var i in global.config.welcome_message) {
					acsp.sendChat(car_id, global.config.welcome_message[i]);
				}
			}

			/* handicap : weight(kg) - data.json */
			self.ballast(car_id);
		},
		/* Connection closed */
		connection_closed: function(car_info) {
			delete drivers[car_info.car_id];

			console.log("** Connection Closed");
			console.log(car_info);
		},
		/* Car information */
		car_info: function(car_info) {
			if(car_info.isConnected) {
				drivers[car_info.car_id] = car_info;
			}
		}
	};
}

// allow emit events
util.inherits(plugin, EventEmitter);

plugin.prototype.getDriverInfo = function(driver) {
	var self = this;
	var handler;

	process.send({ command: 'driver_info', data: { name : driver.name, guid : driver.guid } });

	return new Promise(function(resolve, reject) {
		handler = function(driver_info) {
			if(driver_info.guid === driver.guid) {
				resolve(driver_info);
				self.removeListener('driver_info', handler);
			}
		}

		self.on('driver_info', handler);
	}).timeout(1000).finally(function() {
		self.removeListener('driver_info', handler);
	});
}

plugin.prototype.ballast=function(car_id) {
	var self = this;
	var car_info = drivers[car_id];
	this.getDriverInfo({ name: car_info.driver_name, guid: car_info.driver_guid }).then(function(driver_info) {
		if(Number(driver_info.ballast) > 0) {
			self.acsp.adminCommand("/ballast " + car_id + " " + driver_info.ballast);
		}
	}, function() {
		console.log("Cannot get a driver info. (Driver : " + car_info.driver_name + ")");
	});
}

plugin.prototype.init=function() {
	var _handler = this._handler;
	var self = this;

	this.acsp.on('listening', _handler.listening);
	this.acsp.on('version', _handler.version);
	this.acsp.on('session_info', _handler.session_info);

	process.on('message', function(msg) {
		switch(msg.command) {
			case "get_current_session_info":
				process.send({ command: 'monitor', monitor_command: 'get_current_session_info', id: msg.id, data: current_session_info });
			break;
			case "get_list_clients":
				process.send({ command: 'list_clients', data: drivers });
			break;
			case "driver_info":
				self.emit("driver_info", msg.data);
			break;
			default:
				console.log("Unknown command : " + msg.command);
			break;
		}
	});

	this._did_not_unbind = this.acsp.eventNames();
}

plugin.prototype.bind=function() {
	var self = this;
	var _handler = this._handler;

	_(Object.keys(this._handler)).forEach(function(handler) {
		if(!_.includes(self._did_not_unbind, handler)) {
			self.acsp.on(handler, _handler[handler]);
		}
	});
}

plugin.prototype.unbind=function() {
	var self = this;
	var _handler = this._handler;

	_(Object.keys(this._handler)).forEach(function(handler) {
		if(!_.includes(self._did_not_unbind, handler)) {
			self.acsp.removeListener(handler, _handler[handler]);
		}
	});
}

module.exports = function(acsp) {
	return new plugin(acsp);
}