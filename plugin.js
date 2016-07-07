const acsp = require('./acsp.js')
	, _ = require('lodash')
	, fs = require('fs')
	, Promise = require('bluebird')
	, low = require('lowdb')
	, util = require('util')
	, moment = require('moment')
	, moment_duration_plugin = require("moment-duration-format")
	, debug = require('debug')('acs-plugin:debug-' + process.pid)
	, info = require('debug')('acs-plugin:info-' + process.pid)
	, io = require('socket.io-client')
	, monitor = require('./plugin-monitor.js');

const SESSION_TYPE = { '1': 'PRACITCE', '2': 'QUALIFY', '3': 'RACE' };
const INCIDENT_POINT = { environment: 0, very_light : 0, light : 1, heavy : 4 };

// set infinity
process.setMaxListeners(0);

var plugin = function(options) {
	var self = this;

	this.plugin_name = 'plugin-' + options.listen_port;

	this.options = options;
	this.acsp = acsp(options);
	this.acsp.setMaxListeners(0);

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
							self._init_car(car_info);

							self.monitor.emit('car_info', car_info);
						}
						self.acsp.getCarInfo(i).then(handler, fail);
					}
				fail = function(e) {
					self._bind();
					_.forEach(self.cars, function(car_info, key) {
						self._ballast(car_info.car_id).error(function(e){});
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
		this._bind = function() {
			debug('ACS event listener has already been added.')
		}
	}	
}

plugin.prototype._init_session = function(session_info) {
	if(typeof this.session === 'object') {
		if(this.session.current_session_index > session_info.current_session_index) {
			debug("Server session loop.");
		}
	}

	// set current session info
	this.session = _.cloneDeep(session_info);

	// calculate session start time
	this.session.startAt = moment().subtract(this.session.elapsed_ms, 'milliseconds').subtract(this.session.wait_time, 'milliseconds');
	debug('Current session start at %s. (elapsed : %s)', 
			this.session.startAt.format('YYYY-MM-DD HH:mm:ss.SSS'), 
			this.session.elapsed_ms);

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
			server_name: session_info.server_name,
			session_start_at: this.session.startAt.unix(),
			session_index: session_info.current_session_index,
			session_count: session_info.session_count,
			session_type: session_info.type,
			session_time: session_info.time,
			race_laps: session_info.laps,
			wait_time: session_info.wait_time,
			track: session_info.track,
			track_config: session_info.track_config,
			cars: [],
			laps: [],
			collisions: {
				with_env: [],
				with_car: []
			}
		}).value();
}

plugin.prototype.new_session = function(session_info) {
	var self = this;
	this._init_session(session_info);

	_.forEach(this.cars, function(car, key) {
		car.rtime = 0;
		car.rlaps = 0;
		car.bestlap = Number.MAX_VALUE;

		self.result.get('cars').push(car).value();
	});

	this.monitor.emit('session_info', session_info);
}

plugin.prototype.end_session = function(result_filename) {
	debug('end session (%s)', result_filename);
}

plugin.prototype._init_car = function(car_info) {
	car_info = _.assign(car_info, { incident: 0, rlaps: 0, rtime: 0, bestlap: Number.MAX_VALUE });
	this.cars[car_info.car_id] = car_info;

	var result_info = this.result.get('cars').find({ driver_guid: car_info.driver_guid }).value();
	if(typeof result_info === 'object') {
		car_info.incident = result_info.incident;
	} else {
		this.result.get('cars').push(_.cloneDeep(car_info)).value();
	}

	process.send({ command: 'add_driver_info', data: { name: car_info.driver_name, guid: car_info.driver_guid } });
}

// New client connected.
plugin.prototype.new_connection = function(car_info) {
	this._init_car(car_info);

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
			self.monitor.emit('chat', self.plugin_name, message, 'info');
		}
	}, function(error) {});

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

	var handler;
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

plugin.prototype.lap_completed = function(lapinfo) {
	var self = this;
	var car_info = this.cars[lapinfo.car_id];
	var rlapinfo = _.find(lapinfo.leaderboard, { rcar_id: lapinfo.car_id });

	var lap = { car_id: car_info.car_id,
				driver_name: car_info.driver_name, 
				driver_guid: car_info.driver_guid,
				laptime: Number(lapinfo.laptime),
				cuts: Number(lapinfo.cuts),
				rlaps: Number(rlapinfo.rlaps),
				rtime: Number(rlapinfo.rtime) };

	car_info.rlaps = rlapinfo.rlaps;
	car_info.rtime = rlapinfo.rtime;

	if(lap.cuts === 0 && lap.laptime < car_info.bestlap) {
		var is_first = car_info.bestlap === Number.MAX_VALUE;

		car_info.bestlap = lap.laptime;

		if(!is_first) {
			this.acsp.sendChat(car_info.car_id, 'New personal best lap time : ' + moment.duration(lap.laptime).format('h:m:ss.SSS'));
		}
		var fastest = this.result.get('cars').sortBy('bestlap').take(1).value();

		if(fastest.length > 0 && fastest[0].bestlap !== Number.MAX_VALUE && fastest[0].bestlap > lap.laptime) {
			if(typeof global.timer === 'object') {
				clearTimeout(global.timer);
			}

			global.fastest = setTimeout(function() {
				self.acsp.broadcastChat('Current session best lap time : ' + moment.duration(lap.laptime).format('h:m:ss.SSS'));
			}, 5000);
		}
	}

	this.result.get('cars').find({ driver_guid: car_info.driver_guid }).assign(car_info).value();
	this.result.get('laps').push(lap).value();
	this.result.write();
}

plugin.prototype.collision_with_env = function(client_event) {
	car_info = this.cars[client_event.car_id];
	current_incident = INCIDENT_POINT.environment;
	car_info.incident += current_incident;

	var message = car_info.driver_name + ' is collision with environment. (Incident : x' + current_incident + ', Total : ' + car_info.incident + ')';
	this.monitor.emit('chat', this.plugin_name, message, 'warning');
	this.acsp.sendChat(car_info.car_id, message);

	var session_time = moment().diff(this.session.startAt);

	this.result.get('cars').find({ driver_guid: car_info.driver_guid }).assign(car_info).value();
	this.result.get('collisions.with_env').push(_.assign(client_event, { driver: { driver_name: car_info.driver_name, driver_guid: car_info.driver_guid }, session_time: session_time })).value();
	this.result.write();
}

plugin.prototype.collision_with_car = function(client_event) {
	car_info = this.cars[client_event.car_id];
	other_car_info = this.cars[client_event.other_car_id];

	var current_incident = 0;
	if(client_event.speed < 5) {
		current_incident = INCIDENT_POINT.very_light;
	} else if(client_event.speed < 15) {
		current_incident = INCIDENT_POINT.light;
	} else {
		current_incident = INCIDENT_POINT.heavy;
	}

	car_info.incident += current_incident;

	var message = car_info.driver_name + ' is collision with ' + other_car_info.driver_name + '. (Incident : x' + current_incident + ', Total : ' + car_info.incident + ')';
	this.monitor.emit('chat', this.plugin_name, message, 'warning');
	this.acsp.sendChat(car_info.car_id, message);

	var session_time = moment().diff(this.session.startAt);

	this.result.get('collisions.with_car').push(_.assign(client_event, { driver: { driver_name: car_info.driver_name, driver_guid: car_info.driver_guid }, other_driver: { driver_name: other_car_info.driver_name, driver_guid: other_car_info.driver_guid }, session_time: session_time })).value();
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