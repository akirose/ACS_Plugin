const acsp = require('./acsp.js');
const accc = require('./accc.js');
const fs = require('fs');

// Process SIGNAL Event Listening
process.on('SIGTERM', function() {
	console.log("Stop ACS Plug-in.");
	process.exit();
});

global.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

var welcome_message = [];
var wmArr = config.welcome_message.split("\n");
for(var idx in wmArr) {
	welcome_message.push(wmArr[idx].trim());
}

var plugin_config = config.plugins[process.argv[2]];
wmArr = plugin_config.welcome_message.split("\n");
for(var idx in wmArr) {
	welcome_message.push(wmArr[idx].trim());
}
config.welcome_message = welcome_message;

// Assetto Corsa Server Protocol
var ac = acsp(plugin_config);
ac.setMaxListeners(0);

// ACCC Plug-in
var plugin = accc(ac);

ac.once('listening', function() {
	plugin.init();
	ac.emit('listening');

	console.log("ACS Plug-in Running (PID : " + process.pid + ")");
}).on('error', function(e) {
});