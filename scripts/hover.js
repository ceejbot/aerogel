var Aerogel = require('../index');

var driver = new Aerogel.CrazyDriver();
var copter = new Aerogel.Copter(driver);
process.on('SIGINT', bail);

function bail()
{
	return copter.shutdown()
	.then(function()
	{
		return process.exit(0);
	})
	.fail(function(err)
	{
		console.log(err);
		copter.shutdown();
		return process.exit(0);
	})
	.done();
}


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
.then(function()
{
	return copter.takeoff();
})
.then(function()
{
	setTimeout(land, 5000);
	return copter.hover();
})
.fail(function(err)
{
	console.log(err);
	bail();
})
.done();
