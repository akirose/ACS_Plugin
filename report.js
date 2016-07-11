const acsp = require('./acsp.js')
	, _ = require('lodash')
	, fs = require('fs')
	, low = require('lowdb')
	, moment = require('moment')
	, moment_duration_plugin = require("moment-duration-format")
	, debug = require('debug')('acs-report:debug')
	, sprintf = require('sprintf-js').sprintf;

if(module.parent === null) {
	result(process.argv[2]);
}

function result(file) {
	var raw = low(file, {storage: {read: require('lowdb/lib/file-sync').read}});
	var session_type = Number(raw.get('session_type').value());
	var wait_time = Number(raw.get('wait_time').value());

	console.log('* Session Result');
	var first;
	if(session_type === 3) {
		var records = raw.get('cars').orderBy(['rlaps', 'rtime'], ['desc', 'asc']).forEach(function(record, key) {
			record.bestlap = (record.bestlap === Number.MAX_VALUE) ? 0 : record.bestlap;
			var gap = (typeof first === 'undefined') ? '--' : moment.duration(record.rtime).subtract(first.rtime).format('h[:]mm:ss.SSS');

			if(key === 0) {
				first = record;
			}

			console.log(sprintf('%16s\t%12s\t%12s\t%12s\t%2d\t%2d\t%3d', record.driver_name, moment.duration(record.bestlap).format('h[:]mm:ss.SSS'), gap, moment.duration(record.rtime).format('h[:]mm:ss.SSS'), record.rlaps, record.incident, record.ballast));
		}).value();
	} else {
		var records = raw.get('cars').orderBy(['rtime'], ['desc']).forEach(function(record, key) {
			record.bestlap = (record.bestlap === Number.MAX_VALUE) ? 0 : record.bestlap;
			var gap = (typeof first === 'undefined') ? '--' : moment.duration(record.bestlap).subtract(first.bestlap).format('h[:]mm:ss.SSS');

			if(key === 0) {
				first = record;
			}

			console.log(sprintf('%16s\t%12s\t%12s\t%2d', record.driver_name, moment.duration(record.bestlap).format('h[:]mm:ss.SSS'), gap, record.rlaps));
		}).value();
	}

	console.log('* Collisions with environment');
	raw.get('collisions.with_env').forEach(function(col, key) {
		console.log(sprintf('%16s\t%12s', col.driver.driver_name, moment.duration(col.session_time).format('h[:]mm:ss.SSS')));
	}).value();

	console.log('* Collisions with other car');
	raw.get('collisions.with_car').forEach(function(col, key) {
		console.log(sprintf('%16s\t%16s\t%12s', col.driver.driver_name, col.other_driver.driver_name, moment.duration(col.session_time).format('h[:]mm:ss.SSS')));
	}).value();
}