var Aerogel = require('../index');

var driver = new Aerogel.CrazyDriver();
var copter = new Aerogel.Copter(driver);
process.on('SIGINT', bail);

function bail()
{
	return copter.land()
	.then(function()
	{
		return copter.shutdown();
	})
	.then(function()
	{
		return process.exit(0);
	})
	.fail(function(err)
	{
		console.log(err);
		return process.exit(0);
	})
	.done();
}


copter.on('ready', function()
{
	copter.takeoff()
	.then(function()
	{
		copter.hover();
		setTimeout(land, 5000);
	});
});

function land()
{
	copter.land()
	.then(function() { return copter.shutdown(); })
	.then(function(response)
	{
		console.log(response);
		process.exit(0);
	})
	.fail(function(err)
	{
		console.log(err);
		copter.shutdown()
		.then(function(response)
		{
			console.log(response);
			process.exit(1);
		});
	})
	.done();
}

driver.findCopters()
.then(function(copters)
{
	if (copters.length === 0)
	{
		console.error('No copters found! Is your copter turned on?');
		process.exit(1);
	}

	var uri = copters[0];
	console.log('Using copter at', uri);
	return uri;
})
.then(function(uri)
{
	return copter.connect(uri);
})
.done();
