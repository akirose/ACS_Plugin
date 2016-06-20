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

		socket.on('session_info', function(client_id, pid, session_info) {
			if(typeof session_info === 'undefined') { // request to plug-in
				self.io.to(plugins[pid]).emit('session_info', client_id);
			} else { // response to monitor
				self.io.to((client_id || 'monitor')).emit('session_info', pid, session_info);
			}
		});

		// notify to all monitors
		socket.on('new_connection', function(car_info) {
			self.io.to('monitor').emit('new_connection', car_info);
		});

		socket.on('chat', function(message, type) {
			if(this.monitor.type === 'plugin') {
				self.io.to('monitor').emit('chat', message, type);
			}
		});

		socket.on('disconnect', function() {
			info('Client disconnected. (%s, PID : %d)', this.monitor.type, (this.monitor.pid || -1));
			self.io.to('monitor').emit('plugin_disconnect', this.monitor.pid);

			// remove plug-in client id index
			delete plugins[this.monitor.pid];
		});
	});
};