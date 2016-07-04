const _ = require('lodash');

module.exports = function(plugin, debug, info) {
	return {
		connect: function() {
			info('Connected to monitor server.');
			this.emit('greet', { type: 'plugin', pid: process.pid, options: plugin.options });
		},
		plugin_info: function(client_id) {
			this.emit('plugin_info', client_id, { pid: process.pid, options: plugin.options });
		},
		session_info: function(client_id) {
			plugin.acsp.getSessionInfo().then((session_info) => {
				this.emit('session_info', session_info, client_id);
			}, function(error) {
				info("Plug-in(PID:%d) has not yet been connect to AC Server.", process.pid);
			});
		},
		car_info: function(client_id, car_id) {
			if(car_id === -1) {
				this.emit('car_info', _.map(plugin.cars), client_id);
			} else {
				this.emit('car_info', plugin.cars[car_id], client_id);
			}
		},
		ballast: function(car_id, weight) {
			plugin.acsp.adminCommand('/ballast ' + car_id + ' ' + weight);

			var car_info = plugin.cars[car_id];
			var message = car_info.driver_name + ' is applied to weight penalty ' + weight + 'kg.';
			plugin.acsp.sendChat(car_id, message);
			this.emit('chat', plugin.plugin_name, message, 'info');
		},
		kickUser: function(car_id) {
			plugin.acsp.kickUser(car_id);
		},
		banUser: function(car_id) {
			plugin.acsp.adminCommand('/ban ' + car_id);
		},
		privateChat: function(car_id, message) {
			plugin.acsp.sendChat(car_id, message);
		},
		broadcastChat: function(message) {
			plugin.acsp.broadcastChat(message);
		},
		command: function(command) {
			plugin.acsp.adminCommand(command);
		}
	};
}