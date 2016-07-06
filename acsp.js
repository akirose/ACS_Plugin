const dgram = require('dgram');
const Iconv = require('iconv').Iconv;
const EventEmitter = require('events').EventEmitter;
const BufferReader = require('buffer-reader');
const util = require('util');
const Promise = require('bluebird');
const PromiseQueue = require('promise-queue');
PromiseQueue.configure(Promise);

const encoder = new Iconv('UTF-8', 'UTF-32LE');
const decoder = new Iconv('UTF-32LE', 'UTF-8');

function ACSP(options) {
	var self = this;

	this.options = options;
	this.sock = dgram.createSocket('udp4');
	Promise.promisifyAll(this.sock);

	// Message send queue
	this.sendQueue = new PromiseQueue(1, Infinity);

	this.sock.on('error', function(err) {
		self.emit('error', err);
	});

	this.sock.on('message', function(msg, rinfo) {
		self._handleMessage(new BufferReader(msg), rinfo);
	});

	this.sock.on('listening', function() {
		self.emit('listening');
	});

	this.sock.bind(this.options.listen_port);
}

// allow emit events
util.inherits(ACSP, EventEmitter);

// define some constants
ACSP.NEW_SESSION               = 50;
ACSP.NEW_CONNECTION            = 51;
ACSP.CONNECTION_CLOSED         = 52;
ACSP.CAR_UPDATE                = 53;
ACSP.CAR_INFO                  = 54; // Sent as response to ACSP_GET_CAR_INFO command
ACSP.END_SESSION               = 55;
ACSP.VERSION                   = 56;
ACSP.CHAT                      = 57;
ACSP.CLIENT_LOADED             = 58;
ACSP.SESSION_INFO              = 59;
ACSP.ERROR                     = 60;
ACSP.LAP_COMPLETED             = 73;
// EVENTS
ACSP.CLIENT_EVENT              = 130;
// EVENT TYPES
ACSP.CE_COLLISION_WITH_CAR     = 10;
ACSP.CE_COLLISION_WITH_ENV     = 11;
// COMMANDS
ACSP.REALTIMEPOS_INTERVAL      = 200;
ACSP.GET_CAR_INFO              = 201;
ACSP.SEND_CHAT                 = 202; // Sends chat to one car
ACSP.BROADCAST_CHAT            = 203; // Sends chat to everybody 
ACSP.GET_SESSION_INFO          = 204;
ACSP.SET_SESSION_INFO          = 205;
ACSP.KICK_USER                 = 206;
ACSP.NEXT_SESSION              = 207;
ACSP.RESTART_SESSION           = 208;
ACSP.ADMIN_COMMAND             = 209;

/**
 * [private] Send packet to AC server
 * @param  {Buffer} buf Contents of the message
 * @return {Promise} resolved when message is sent
 */
ACSP.prototype._send = function(buf) {
    var self = this;
    return this.sendQueue.add(function(){
        return self.sock.sendAsync(buf, 0, buf.length, self.options.server_port, self.options.server_host);
    });
}

ACSP.prototype.getCarInfo = function(car_id) {
	var buf = Buffer.alloc(2);
	buf.writeUInt8(ACSP.GET_CAR_INFO, 0);
	buf.writeUInt8(car_id, 1);

	this._send(buf);

	var self = this;
	var handler;

	return new Promise(function(resolve, reject) {
		handler = function(car_info) {
			if(car_info.car_id === car_id) {
				resolve(car_info);
				self.removeListener('car_info', handler);
			}
		}

		self.on('car_info', handler);
	}).timeout(1000).finally(function() {
		self.removeListener('car_info', handler);
	});
}

ACSP.prototype.getSessionInfo = function(session_index) {
	if(typeof session_index === 'undefined') {
		// Session index (-1 to request the current session)
		session_index = -1;
	}

	var buf = Buffer.alloc(3);
	buf.writeUInt8(ACSP.GET_SESSION_INFO, 0);
	buf.writeInt16LE(session_index, 1);

	this._send(buf);

	var self = this;
	var handler;

	return new Promise(function(resolve, reject) {
		handler = function(session_info) {
			if(session_info.session_index === session_index || (session_index === -1 && session_info.session_index === session_info.current_session_index))  {
				resolve(session_info);
				self.removeListener('session_info', handler);
			}
		};

		self.on('session_info', handler);
	}).timeout(1000).finally(function() {
		self.removeListener('session_info', handler);
	});
}

ACSP.prototype.setSessionInfo = function(session_info) {
	var strBuf = this.writeStringW(session_info.name);
	var buf = Buffer.alloc(strBuf.length + 15);
	buf.writeUInt8(ACSP.SET_SESSION_INFO, 0);
	buf.writeUInt8(session_info.session_index, 1);
	strBuf.copy(buf, 2);
	buf.writeUInt8(session_info.type, strBuf.length+2);
	buf.writeUInt32LE(session_info.laps, strBuf.length+3);
	buf.writeUInt32LE(session_info.time, strBuf.length+7);
	buf.writeUInt32LE(session_info.wait_time, strBuf.length+11);

	return this._send(buf);
}

ACSP.prototype.enableRealtimeReport = function(interval) {
	var buf = Buffer.alloc(3);
	buf.writeUInt8(ACSP.REALTIMEPOS_INTERVAL, 0);
	buf.writeUInt16LE(interval, 1);

	return this._send(buf);
}

ACSP.prototype.sendChat = function(car_id, message) {
	var strBuf = this.writeStringW(message);
	var buf = Buffer.alloc(strBuf.length + 2);
	buf.writeUInt8(ACSP.SEND_CHAT, 0);
	buf.writeUInt8(car_id, 1);
	strBuf.copy(buf, 2);

	return this._send(buf);
}

ACSP.prototype.broadcastChat = function(message) {
	var strBuf = this.writeStringW(message);
	var buf = Buffer.alloc(strBuf.length + 1);
	buf.writeUInt8(ACSP.BROADCAST_CHAT, 0);
	strBuf.copy(buf, 1);

	return this._send(buf);
}

ACSP.prototype.adminCommand = function(command) {
	var strBuf = this.writeStringW(command);
	var buf = Buffer.alloc(strBuf.length + 1);
	buf.writeUInt8(ACSP.ADMIN_COMMAND, 0);
	strBuf.copy(buf, 1);

	return this._send(buf);
}

ACSP.prototype.restartSession = function() {
	var buf = Buffer.alloc(1);
	buf.writeUInt8(ACSP.RESTART_SESSION, 0);

	return this._send(buf);
}

ACSP.prototype.nextSession = function() {
	var buf = Buffer.alloc(1);
	buf.writeUInt8(ACSP.NEXT_SESSION, 0);

	return this._send(buf);
}

ACSP.prototype.kickUser = function(car_id) {
	var buf = Buffer.alloc(2);
	buf.writeUInt8(ACSP.KICK_USER, 0);
	buf.writeUInt8(car_id, 1);

	return this._send(buf);
}

ACSP.prototype._handleMessage = function(buf, rinfo) {
	var packet_id = buf.nextUInt8();

	switch(packet_id) {
		case ACSP.ERROR:
			var msg = this.readStringW(buf);
			console.log('ERROR (MSG : %s)', msg);
			this.emit('error', msg);
			break;
		case ACSP.VERSION:
			var version = buf.nextUInt8();
			this.emit('version', version);
			break;
		case ACSP.NEW_SESSION:
		case ACSP.SESSION_INFO:
			var session_info = {
				version: buf.nextUInt8(),
				session_index: buf.nextUInt8(),
				current_session_index: buf.nextUInt8(),
				session_count: buf.nextUInt8(),

				server_name: this.readStringW(buf),
				track: this.readString(buf),
				track_config: this.readString(buf),
				name: this.readString(buf),
				type: buf.nextUInt8(),
				time: buf.nextUInt16LE(),
				laps: buf.nextUInt16LE(),
				wait_time: buf.nextUInt16LE(),
				ambient_temp: buf.nextUInt8(),
				road_temp: buf.nextUInt8(),
				weather_graphics: this.readString(buf),
				elapsed_ms: buf.nextInt32LE()
			};

			this.emit('session_info', session_info);
			if(packet_id == ACSP.NEW_SESSION) { this.emit('new_session', session_info); }
			break;
		case ACSP.END_SESSION:
			this.emit('end_session', this.readString(buf));
			break;
		case ACSP.CHAT:
			var car_id = buf.nextUInt8();
			var message = this.readStringW(buf);
			
			this.emit('chat', car_id, message);
			break;
		case ACSP.NEW_CONNECTION:
			var car_info = {
				driver_name: this.readStringW(buf),
				driver_guid: this.readStringW(buf),
				car_id: buf.nextUInt8(),
				car_model: this.readString(buf),
				car_skin: this.readString(buf)
			}

			this.emit('new_connection', car_info);
			break;
		case ACSP.CLIENT_LOADED:
			var car_id = buf.nextUInt8();
			this.emit('client_loaded', car_id);
			break;
		case ACSP.CONNECTION_CLOSED:
			var car_info = {
				driver_name: this.readStringW(buf),
				driver_guid: this.readStringW(buf),
				car_id: buf.nextUInt8(),
				car_model: this.readString(buf),
				car_skin: this.readString(buf)
			}

			this.emit('connection_closed', car_info);
			break;
		case ACSP.LAP_COMPLETED:
			var lapinfo = {
				car_id: buf.nextUInt8(),
				laptime: buf.nextUInt32LE(),
				cuts: buf.nextUInt8(),
				cars_count: buf.nextUInt8()
			};

			lapinfo.leaderboard = [];
			for(var i = 0; i < Number(lapinfo.cars_count); i++) {
				lapinfo.leaderboard.push({
					rcar_id: buf.nextUInt8(),
					rtime: buf.nextUInt32LE(),
					rlaps: buf.nextUInt16LE()
				});
			}
			lapinfo.grip_level = buf.nextFloatLE();
			this.emit('lap_completed', lapinfo);
			break;
		case ACSP.CAR_INFO:
			var car_info = {
				car_id: buf.nextUInt8(),
				is_connected: (buf.nextUInt8() != 0),
				car_model: this.readStringW(buf),
				car_skin: this.readStringW(buf),
				driver_name: this.readStringW(buf),
				driver_team: this.readStringW(buf),
				driver_guid: this.readStringW(buf)
			};

			this.emit('car_info', car_info);
			break;
		case ACSP.CAR_UPDATE:
			this.emit('car_update', {
				car_id: buf.nextUInt8(),
				pos: this.readVector3f(buf),
				velocity: this.readVector3f(buf),
				gear: buf.nextUInt8(),
				engine_rpm: buf.nextUInt16LE(),
				normalized_spline_pos: buf.nextFloatLE()
			});
			break;
		case ACSP.CLIENT_EVENT:
			var client_event = {
				ev_type: buf.nextUInt8(),
				car_id: buf.nextUInt8(),
			}

			if(client_event.ev_type == ACSP.CE_COLLISION_WITH_CAR) {
				client_event.other_car_id = buf.nextUInt8();
			}

			client_event.speed = buf.nextFloatLE();
			client_event.world_pos = this.readVector3f(buf);
			client_event.rel_pos = this.readVector3f(buf);

			this.emit('client_event', client_event);
			if(client_event.ev_type == ACSP.CE_COLLISION_WITH_ENV) {
				this.emit('collision_with_env', client_event);
			} else if(client_event.ev_type == ACSP.CE_COLLISION_WITH_CAR) {
				this.emit('collision_with_car', client_event);;
			}
			break;
		default:
			console.log('Unsupported message (Packet ID : %d)', packet_id);
			break;
	}
}

ACSP.prototype.writeStringW = function(str) {
    if (typeof str !== "string") {
        str = "" + str;
    }
    if (str.length > 255) {
        str = str.substr(0, 255);
    }
    var buf = Buffer.alloc((str.length * 4) + 1);
    buf.writeUInt8(str.length, 0);
    
    if (str.length > 0) {
        // Hacky method that ignores half the UTF-32 space
        encoder.convert(str).copy(buf, 1, 0);
    }

    return buf;
}

ACSP.prototype.readString = function(buf) {
	var length = buf.nextUInt8();
	var strBuf = buf.nextBuffer(length);

	return strBuf.toString('utf8');
}

ACSP.prototype.readStringW = function(buf) {
	var length = buf.nextUInt8();
	var strBuf = buf.nextBuffer(length*4);

	//return strBuf.toString('utf-16le').replace(/\u0000/gi, '');
	return decoder.convert(strBuf).toString();
}

ACSP.prototype.readVector3f = function (buf){
    return {
        x: buf.nextFloatLE(),
        y: buf.nextFloatLE(),
        z: buf.nextFloatLE()
    };
}

module.exports = function(options) {
	return new ACSP(options);
}