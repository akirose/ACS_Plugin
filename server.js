const acsp = require('./acsp.js');
const fs = require('fs');
const low = require('lowdb');
const storage = require('lowdb/file-sync');

const db = low('data.json', {storage});
global.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
var drivers = {};
var current_session_info = {};

process.on('SIGINT', function() {
	process.exit();
});

// Assetto Corsa Server Protocol
var ac = acsp(config);

ac.on('listening', function() {
	global.timer = setInterval(function() {
		ac.getSessionInfo().then(function(session_info) {
			ac.setMaxListeners(0);
			for(var i = 0; i < 36; i++) {
				ac.getCarInfo(i).then(function(car_info) {
						if(car_info.isConnected) {
							ac.emit('client_loaded', car_info.car_id);
						}
					}, function(e) {});
			}
			ac.setMaxListeners(10);
		}, function(e) {});
	}, 5000);
});


// Handling Server Session
ac.on('version', function(version) {
	console.log("** Protocol version : %d", version);

	ac.adminCommand('/admin ' + global.config.server_admin_password);
}).on('session_info', function(session_info) {
	if(typeof global.timer === 'object') {
		clearInterval(timer);
		delete global.timer;
	}

	current_session_info = session_info;

	console.log("** Session Information");
	console.log(session_info);
});


// Handling Client Connection
ac.on('new_connection', function(car_info) {
	const driver = db('drivers').find({ guid: car_info.driver_guid });
	if(typeof driver === 'undefined') {
		db('drivers').push({ name: car_info.driver_name, guid: car_info.driver_guid, ballast: 0 });
	}

	drivers[car_info.car_id] = driver_info;

	console.log("** New Connection");
	console.log(car_info);
}).on('connection_closed', function(car_info) {
	delete drivers[car_info.car_id];

	console.log("** Connection Closed");
	console.log(car_info);
}).on('client_loaded', function(car_id) {
	/* Send welcome message to private chat */
	if(typeof global.config.welcome_message != 'undefined') {
		for(var m in global.config.welcome_message) {
			ac.sendChat(car_id, m);
		}
	}

	driver = drivers[car_id];
	user = db('drivers').find({ guid: driver.driver_guid });
	if(typeof user !== 'undefined') {
		if(user.ballast > 0) {
			ac.adminCommand("/ballast " + car_id + " " + user.ballast);
		}
	}
});

