const setup = require('./setup/setup.js');
const fs = require('fs');
const child_process = require('child_process');

global.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Process SIGNAL Event Listening
process.on('SIGINT', function() {
	process.exit();
});

setup.listen(3000, function() {
	console.log("setup is running at port (3000)");
});

for(var i = 0; i < config.length; i++) {
	child_process.fork("worker.js", [i])
		.on('message', function(m, handle) {
			console.log(m);
		});
}
