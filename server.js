const setup = require('./setup/setup.js');
const fs = require('fs');
const child_process = require('child_process');

var plugin_childs = [];

// Process SIGNAL Event Listening
process.on('SIGINT', function() {
	process.exit();
});

setup.listen(3000, function() {
	console.log("setup is running at port (3000)");
});

setup.on('run-plugin', function() {
	var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
	for(var i = 0; i < config.plugins.length; i++) {
		var child = child_process.fork("plugin.js", [i]);

		plugin_childs.push(child);
	}
}).on('stop-plugin', function() {
	for(var i = 0; i < plugin_childs.length; i++) {
		var child = plugin_childs[i];
		child.kill('SIGINT');
	}
});
/*
for(var i = 0; i < config.plugins.length; i++) {
	child_process.fork("worker.js", [i])
		.on('message', function(m, handle) {
			console.log(m);
		});
}*/