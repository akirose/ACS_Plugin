const acsp = require('./acsp.js');
const accc = require('./accc.js');
const fs = require('fs');

// Process SIGNAL Event Listening
process.on('SIGINT', function() {
	console.log("Stop ACS Plug-in.");
	process.exit();
});

global.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Assetto Corsa Server Protocol
var ac = acsp(config.plugins[process.argv[2]]);
ac.setMaxListeners(0);

// ACCC Plug-in
var plugin = accc(ac);

ac.once('listening', function() {
	plugin.init();
	console.log('Listening... ' + process.pid);
	ac.emit('listening');
}).on('error', function(e) {
});