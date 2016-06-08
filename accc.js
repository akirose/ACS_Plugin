const _ = require('lodash');
const low = require('lowdb');
const storage = require('lowdb/file-sync');

const db = low('data.json', {storage});

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
			const driver = db('drivers').find({ guid: car_info.driver_guid });
			if(typeof driver === 'undefined') {
				db('drivers').push({ name: car_info.driver_name, guid: car_info.driver_guid, ballast: 0 });
			}

			drivers[car_info.car_id] = driver_info;

			console.log("** New Connection");
			console.log(car_info);
		},
		/* Client loaded */
		client_loaded: function(car_id) {
			/* Send welcome message to private chat */
			if(typeof global.config.welcome_message != 'undefined') {
				for(var m in global.config.welcome_message) {
					ac.sendChat(car_id, m);
				}
			}


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

plugin.prototype.ballast=function() {
	driver = drivers[car_id];
	user = db('drivers').find({ guid: driver.driver_guid });
	if(typeof user !== 'undefined') {
		if(user.ballast > 0) {
			ac.adminCommand("/ballast " + car_id + " " + user.ballast);
		}
	}
}

plugin.prototype.init=function() {
	var _handler = this._handler;

	this.acsp.on('listening', _handler.listening);
	this.acsp.on('version', _handler.version);
	this.acsp.on('session_info', _handler.session_info);

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