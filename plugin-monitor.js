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
				this.emit('session_info', client_id, process.pid, session_info);
			}, function(error) {
				info("Plug-in (PID : %d) has not yet been connect to AC Server.", process.pid);
			});
		}
	};
}