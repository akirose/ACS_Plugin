module.exports = function(io) {
	this.io = io;

	io.of('/monitor').on('connection', (socket) => {
		socket.on('disconnect', function() {
		});
	});
};