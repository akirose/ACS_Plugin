const acsp = require('./acsp.js')
	, _ = require('lodash')
	, fs = require('fs')
	, Promise = require('bluebird')
	, EventEmitter = require('events').EventEmitter
	, low = require('lowdb')
	, util = require('util')
	, moment = require('moment')
	, moment_duration_plugin = require("moment-duration-format")
	, debug = require('debug')('acs-plugin:debug-' + process.pid)
	, info = require('debug')('acs-plugin:info-' + process.pid)
	, io = require('socket.io-client')
	, monitor = require('./plugin-monitor.js');

const SESSION_TYPE = { '1': 'PRACITCE', '2': 'QUALIFY', '3': 'RACE' };
const INCIDENT_POINT = { environment: 1, very_light : 0, light : 1, heavy : 4 };

var plugin = function(options) {
	var self = this;

	this.options = options;
	this.acsp = acsp(options);

	this.cars = {};
	this.session = {};

	// Connect to monitor socket
	this.monitor = io('http://localhost:' + options.monitor_port + '/monitor');

	this.acsp.once('listening', function() {
		info('ACS Plug-in listening on port %d (ACServer : %s:%d)', this.options.listen_port, this.options.server_host, this.options.server_port);

		// Attach monitor socket handlers
		_.forEach(monitor(self, debug, info), function(value, key) {
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

				// init current session
				self._init_session(session_info);

				var i = 0;
				handler = function(car_info) {
						i++;
						if(car_info.is_connected == true) {
							car_info = _.assign(car_info, { incident: 0 });
							self.cars[car_info.car_id] = car_info;
							self.result.get('cars').push(_.cloneDeep(car_info)).value();

							process.send({ command: 'add_driver_info', data: { name: car_info.driver_name, guid: car_info.driver_guid } });
							self.monitor.emit('car_info', car_info);
						}
						self.acsp.getCarInfo(i).then(handler, fail);
					}
				fail = function(e) {
					self._bind();
					_.forEach(self.cars, function(car_info, key) {
						self._ballast(car_info.car_id);
					});
				}
				self.acsp.getCarInfo(i).then(handler, fail);
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

plugin.prototype._init_session = function(session_info) {
	// set current session info
	this.session = session_info;

	// calculate session start time
	this._session_start_at(Number(session_info.elapsed_ms));

	// current session result filename
	var filename = 'results/' + this.session.startAt.format('YYYYMMDD_HHmm') + '-' + this.options.listen_port + '-' + SESSION_TYPE[this.session.type] + '.json';

	this.result = low(filename, { storage: {
		read: function(source) {
		    var deserialize = arguments.length <= 1 || arguments[1] === undefined ? JSON.parse : arguments[1];
		    try {
		    	if(fs.statSync(source).isFile()) {
		    		var data = fs.readFileSync(source, 'utf-8').trim() || '{}';

		    		try {
		    			return deserialize(data);
		    		} catch(e) {
				        if (e instanceof SyntaxError) {
				          e.message = 'Malformed JSON in file: ' + source + '\n' + e.message;
				        }
				        throw e;
		    		}
		    	}
		    } catch(e) {
		    	return {};
		    }
		},
		write: require('lowdb/lib/file-sync').write
	}, writeOnChange: false });
	this.result.defaults({ 
			session_start_at: this.session.startAt.format('YYYY-MM-DD HH:mm'),
			server_name: session_info.server_name,
			session_type: SESSION_TYPE[session_info.session_type],
			track: session_info.track,
			track_config: session_info.track_config,
			cars: [],
			collisions: {
				with_env: [],
				with_car: []
			}
		}).value();
}

plugin.prototype.new_session = function(session_info) {
	this._init_session(session_info);
}
plugin.prototype._session_start_at = function(elapsed_ms) {
	this.session.startAt = moment().subtract((elapsed_ms / 1000), 'seconds');
	debug('Current session start at %s. (elapsed : %s)', 
			this.session.startAt.format('YYYY-MM-DD HH:mm:ss.SSS'), 
			moment.duration(moment().diff(this.session.startAt)).format('h:mm:ss.SSS'));
}

plugin.prototype.end_session = function(result_filename) {
	debug('end session (%s)', result_filename);
}

// New client connected.
plugin.prototype.new_connection = function(car_info) {
	car_info = _.assign(car_info, { incident: 0 });
	this.cars[car_info.car_id] = car_info;
	this.result.get('cars').push(_.cloneDeep(car_info)).value();

	process.send({ command: 'add_driver_info', data: { name: car_info.driver_name, guid: car_info.driver_guid } });
	this.monitor.emit('new_connection', car_info);
}

plugin.prototype.connection_closed = function(car_info) {
	delete this.cars[car_info.car_id];
	
	this.monitor.emit('connection_closed', car_info);
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
		if(driver_info.ballast > 0) {
			var message = driver_info.name + ' is applied to weight penalty ' + driver_info.ballast + 'kg.';
			self.acsp.sendChat(car_id, message);
			self.monitor.emit('chat', 'plugin-'+self.options.listen_port, message, 'info');
		}
	});

	this.monitor.emit('car_info', car_info);
}

// (private) Send welcome message to client.
plugin.prototype._welcome_message = function(car_id) {
	var self = this;
	_.forEach(this.options.welcome_message, function(message, key) {
		self.acsp.sendChat(car_id, message);
	});
}

// (private) Applying a weight penalty.
plugin.prototype._ballast = function(car_id) {
	var self = this;
	var car_info = this.cars[car_id];
	process.send({ command: 'driver_info', data: car_info.driver_guid });

	return new Promise(function(resolve, reject) {
		handler = function(message) {
			if(typeof message !== 'object' || typeof message.command !== 'string') return;

			if(message.command === 'driver_info' && typeof message.data === 'object') {
				var driver_info = message.data;
				if(driver_info.guid === car_info.driver_guid) {
					resolve(driver_info);
					process.removeListener('message', handler);
				}
			}
		}
		process.on('message', handler);
	}).timeout(1000)
	.then(function(driver_info) {
		if(Number(driver_info.ballast) > 0) {
			self.acsp.adminCommand('/ballast ' + car_id + ' ' + driver_info.ballast);
		}
		return driver_info;
	})
	.finally(function() {
		process.removeListener('message', handler);
	});
}

plugin.prototype.collision_with_env = function(client_event) {
	car_info = this.cars[client_event.car_id];
	current_incident = INCIDENT_POINT.environment;
	car_info.incident += current_incident;

	var message = car_info.driver_name + ' is collision with environment. (Incident : x' + current_incident + ', Total : ' + car_info.incident + ')';
	this.monitor.emit('chat', 'plugin-'+this.options.listen_port, message, 'warning');
	this.acsp.sendChat(car_info.car_id, message);

	this.result.get('cars').find({ driver_guid: car_info.driver_guid }).assign(car_info).value();
	this.result.write();
}

plugin.prototype.collision_with_car = function(client_event) {
	car_info = this.cars[client_event.car_id];

	var current_incident = 0;
	if(client_event.speed < 5) {
		current_incident = INCIDENT_POINT.very_light;
	} else if(client_event.speed < 15) {
		current_incident = INCIDENT_POINT.light;
	} else {
		current_incident = INCIDENT_POINT.heavy;
	}

	car_info.incident += current_incident;

	var message = car_info.driver_name + ' is collision with ' + this.cars[client_event.other_car_id].driver_name + '. (Incident : x' + current_incident + ', Total : ' + car_info.incident + ')';
	this.monitor.emit('chat', 'plugin-'+this.options.listen_port, message, 'warning');
	this.acsp.sendChat(car_info.car_id, message);

	this.result.get('cars').find({ driver_guid: car_info.driver_guid }).assign(car_info).value();
	this.result.write();
}

plugin.prototype.chat = function(car_id, message) {
	var car_info = this.cars[car_id];
	this.monitor.emit('chat', car_info.driver_name, message, 'default');
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
process.on('SIGINT', function() {
	process.exit(0);
});
process.on('SIGTERM', function() {
	console.log("Stop ACS Plug-in.");
	process.exit(0);
});