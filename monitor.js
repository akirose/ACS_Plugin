const debug = require('debug')('acs-monitor:debug')
	, info = require('debug')('acs-monitor:info');

module.exports = function(io) {
	var self = this;
	var plugins = {};

	this.io = io.of('/monitor').on('connection', (socket) => {
		// greets with client type.
		socket.on('greet', function(message) {
			if(typeof message === 'object' && typeof message.type === 'string') {
				this.join(message.type);
				this.monitor = { type: message.type };

				if(message.type === 'plugin') {
					var plugin_info = { pid : message.pid, options : message.options };
					this.monitor = Object.assign(this.monitor, plugin_info); 
					// send connected plug-in information to all monitor connections.
					self.io.to('monitor').emit('plugin_info', plugin_info);

					// add plug-in client id to index
					plugins[plugin_info.pid] = this.id;
				} else if(message.type === 'monitor') {
					self.io.to('plugin').emit('plugin_info', this.id);
				}
			} else {
				info("Handshake failed.");
			}
		});

		socket.on('plugin_info', function(client_id, plugin_info) {
			self.io.to((client_id || 'monitor')).emit('plugin_info', plugin_info);
		});

		socket.on('session_info', function() {
			if(typeof this.monitor !== 'object' || typeof this.monitor.type !== 'string') return;

			var client_id, pid, session_info;
			switch(this.monitor.type) {
				case 'monitor':
					[pid] = arguments;
					self.io.to(plugins[pid]).emit('session_info', this.id);
				break;
				case 'plugin':
					[session_info, client_id] = arguments;
					self.io.to((client_id || 'monitor')).emit('session_info', this.monitor.pid, session_info);
				break;
			}
		});

		socket.on('car_info', function() {
			if(typeof this.monitor !== 'object' || typeof this.monitor.type !== 'string') return;

			var client_id, pid, car_id, car_info;
			switch(this.monitor.type) {
				case 'monitor':
					[pid, car_id] = arguments;
					self.io.to(plugins[pid]).emit('car_info', this.id, car_id);
				break;
				case 'plugin':
					[car_info, client_id] = arguments;
					self.io.to((client_id || 'monitor')).emit('car_info', this.monitor.pid, car_info);
				break;
			}
		});

		// notify to all monitors
		socket.on('new_connection', function(car_info) {
			self.io.to('monitor').emit('new_connection', 'plugin-'+this.monitor.pid, car_info);
		});
		socket.on('connection_closed', function(car_info) {
			self.io.to('monitor').emit('connection_closed', 'plugin-'+this.monitor.pid, car_info);
		});

		socket.on('chat', function() {
			var name, message, type, car_id, pid;
			if(this.monitor.type === 'plugin') {
				[name, message, type] = arguments;
				self.io.to('monitor').emit('chat', this.monitor.pid, name, message, type);
			} else if(this.monitor.type === 'monitor') {
				[pid, car_id, message] = arguments;
				if(message.startsWith('/')) {
					self.io.to(plugins[pid] || 'plugin').emit('command', message);
				} else {
					if(Number(car_id) >= 0) {
						if(Number(pid) <= 0 ) return;
						self.io.to(plugins[pid]).emit('privateChat', car_id, message);
					} else {
						self.io.to(plugins[pid] || 'plugin').emit('broadcastChat', message);
					}
				}
			}
		});

		socket.on('disconnect', function() {
			info('Client disconnected. (%s, PID : %d)', this.monitor.type, (this.monitor.pid || -1));

			if(this.monitor.type === 'plugin') {
				self.io.to('monitor').emit('plugin_disconnect', this.monitor.pid);

				// remove plug-in client id index
				delete plugins[this.monitor.pid];
			}
		});
	});
};