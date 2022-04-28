const dgram = require('dgram')
const AWS = require('aws-sdk')
const s3 = new AWS.S3();
const cloudwatch = new AWS.CloudWatch({region: 'eu-west-3'})
const DEBUG = process.env['DEBUG'] === 'true'

function gametypeName(gametype) {
    switch (gametype) {
        case '0':
            return 'Free for all'
        case '1':
            return 'Tournament'
        case '2':
            return 'Free for all deathmatch (Team Arena)'
        case '3':
            return 'Team deathmatch'
        case '4':
            return 'Capture the Flag'
        case '5':
            return 'One Flag Capture (Team Arena)'
        case '6':
            return 'Overload (Team Arena)'
        case '7':
            return 'Harvester (Team Arena)'
        default:
            return gametype
    }
}

function Player(str) {
    this.name = str.split('"')[1]
    this.score = str.split('"')[0].split(' ')[0]
    this.ping = str.split('"')[0].split(' ')[1]
}


function Server(ip, serverStatus, serverInfo) {
    this.tstamp = new Date().toISOString()
    this.hostname = serverStatus.sv_hostname || 'NA'
    this.ip = ip
    this.fraglimit = serverStatus.fraglimit
    this.mapName = serverStatus.mapname
    this.gameName = serverStatus.gamename
    this.gameType = Number(serverStatus.g_gametype)
    this.gameTypeName = gametypeName(serverStatus.g_gametype)
    this.players = serverStatus.players.map(p => new Player(p)).sort((a,b) => (b.score - a.score))
    this.totalPlayers = serverStatus.players.length
    this.humanPlayers = Number(serverInfo.g_humanplayers || 0)
    this.maxPlayers = Number(serverStatus.sv_maxclients || 0)
}

  // Sadly, the default string conversion in node is
  //  2022-04-05T17:14:38.301Z
  // and for this to work with glue, it needs to match the java.sql.Timestamp format
  //  2022-04-05 17:14:38.301
  // It's actually very simple to set a compatible timeformat in the serde definition
  // https://stackoverflow.com/questions/56177686/aws-glue-crawler-does-not-recognize-timestamp-columns-in-csv-format
  // but the cdk glue construct does not support customising the serde, and using an alternative is just too painful right now
  // https://stackoverflow.com/questions/71213512/how-to-add-serde-parameters-in-cdk
  // https://docs.aws.amazon.com/athena/latest/ug/data-types.html
  // https://docs.oracle.com/javase/8/docs/api/java/sql/Timestamp.html
  // On second thought, this is also required to setup partition projection, which would be
  // amazing. basically essential to work with this long term.
  // https://github.com/aws/aws-cdk/issues/16660
function HistoricalTableRow(server) {
    this.tstamp = server.tstamp.replace(/T/, ' ').replace(/Z/, '')
    this.hostname = server.hostname
    this.ip = server.ip
    this.humanPlayers = server.humanPlayers
    this.maxPlayers = server.maxPlayers
}

function Error(ip, serverError) {
    this.ip = ip
    this.error = serverError
}

function ipToStr(ipInt){
    var ipStr = ((ipInt >> 24) & 0xFF).toString() + '.';
    ipStr += ((ipInt >> 16) & 0xFF).toString() + '.';
    ipStr += ((ipInt >>  8) & 0xFF).toString() + '.';
    ipStr += ((ipInt >>  0) & 0xFF).toString();

    // Return constructed string
    return ipStr;
}

/* get info:
challenge:'r4nd0m'
clients:'0'
g_humanplayers:'0'
g_needpass:'0'
gamename:'Quake3Arena'
gametype:'0'
hostname:'EU - MEETUP 21h CET'
mapname:'bal3dm2'
protocol:'68'
pure:'0'
sv_maxclients:'8'
voip:'opus'
*/
async function fetchServerStatus(serverStr, options, callback) {
    return new Promise((resolve, reject) => {
        var socket = serverStr.split(':')
        var server = socket[0]
        var port = socket[1];
        //  Header elements
        var serial = Buffer.alloc(4),
            command = Buffer.from('getstatus r4nd0m');
        serial.writeUInt32LE(0xFFFFFFFF);
        var header = new Buffer.concat([serial, command]);
        var client = dgram.createSocket('udp4');
        // Store current time to meassure response time of request
        var clientTimer = new Date();
        var serverDetailObject = {
            success: false,
            responsetime: 0,
            data: {}
        };
        client.send(header, 0, header.length, port, server, function(err, bytes) {
            if (err) reject(err);
            //console.log('UDP message sent to ' + server +':'+ port);
        });
    
        // Set timeout of options.timeout
        var timeout = setTimeout(function() {
            client.close();
            serverDetailObject.responsetime = options.timeout;
            serverDetailObject.data.error = 'Timeout of ' + options.timeout + ' ms exceeded.';
            resolve(serverDetailObject);
        }, options.timeout);
    
        // Process response from server
        client.on('message', function (response, remote) {
            // Message from server consists in a control sequence, the status message, and a list of players
            // Note: Every line is terminated with a '\n'
            //
            // \ff\ff\ff\ffinfoResponse
            // \voip\opus\g_needpass\0...
            //  0 35 "[MPB] Ceno"
            //  0 48 "[VR] Ceno"

            // The status message is the second line
            // We then split the status message on backslash. Then slice it to remove the first entry
            // ['', 'void, 'opus', 'g_needpass', '0' ...]
            const statusMessage = response.toString().split('\n')[1]
            const parts = statusMessage.split('\\').slice(1);
            
            // The list of players is the 3rd line and beyond
            // We then slice out the last one, which should be an empty string
            // ['0 35 "[MPB] Ceno"', '0 48 "[VR] Ceno"', '']
            const players = response.toString().split('\n').slice(2).slice(0,-1)
            
            // Inject responsetime and empty data object
            serverDetailObject.responsetime = new Date() - clientTimer;
            // For each element, even = key; off = value
            for(var i = 0; i < parts.length; i += 2) {
                var key = parts[i],
                    value = parts[i+1];
                // Transfer value into key
                serverDetailObject.data[key] = value;
            }

            serverDetailObject.data['players'] = players
            // Set success to "true"
            serverDetailObject.success = true;
            // Close connection, clear timer and call callback
            client.close();
            clearTimeout(timeout);
            resolve(serverDetailObject);
        });
    })
}

async function fetchServerInfo(serverStr, options, callback) {
    return new Promise((resolve, reject) => {
        var socket = serverStr.split(':')
        var server = socket[0]
        var port = socket[1];
        //  Header elements
        var serial = Buffer.alloc(4),
            command = Buffer.from('getinfo r4nd0m');
        serial.writeUInt32LE(0xFFFFFFFF);
        var header = new Buffer.concat([serial, command]);
        var client = dgram.createSocket('udp4');
        // Store current time to meassure response time of request
        var clientTimer = new Date();
        var serverDetailObject = {
            success: false,
            responsetime: 0,
            data: {}
        };
        client.send(header, 0, header.length, port, server, function(err, bytes) {
            if (err) reject(err);
            //console.log('UDP message sent to ' + server +':'+ port);
        });
    
        // Set timeout of options.timeout
        var timeout = setTimeout(function() {
            client.close();
            serverDetailObject.responsetime = options.timeout;
            serverDetailObject.data.error = 'Timeout of ' + options.timeout + ' ms exceeded.';
            resolve(serverDetailObject);
        }, options.timeout);
    
        // Process response from server
        client.on('message', function (message, remote) {
            // Slice "\ff\ff\ff\ffinfoResponse\n\\"
            message = message.slice(18);
            // Split buffer by "\\" separator
            var parts = message.toString().split('\\');
            // Inject responsetime and empty data object
            serverDetailObject.responsetime = new Date() - clientTimer;
            // For each element, even = key; off = value
            for(var i = 0; i < parts.length; i += 2) {
                var key = parts[i],
                    value = parts[i+1];
                // Transfer value into key
                serverDetailObject.data[key] = value;
            }
            // Set success to "true"
            serverDetailObject.success = true;
            // Close connection, clear timer and call callback
            client.close();
            clearTimeout(timeout);
            resolve(serverDetailObject);
        });
    })
}

async function queryAvailableServers (serverStr, options, callback) {
  return new Promise((resolve, reject) => {
    var socket = serverStr.split(':')
    var server = socket[0]
    var port = socket[1];
    var serverListArray = [];
    var serial = Buffer.alloc(4),
        command = Buffer.from('getservers 68 empty full');
    serial.writeUInt32LE(0xFFFFFFFF);
    var header = new Buffer.concat([serial, command]);
    var masterclient = dgram.createSocket('udp4');
    masterclient.send(header, 0, header.length, port, server, function(err, bytes) {
        if (err) reject(err);
        //console.log('UDP message sent to ' + server +':'+ port);
    });
    masterclient.on('message', function (message, remote) {
        //console.log('Got a message from ' + server +':'+ port);
        message = message.slice(22); // Slice "\ff\ff\ff\ffgetserversResponse\"
        for (var i = 0; i < message.length; i += 7) {
            var ip = message.readUInt32BE(i + 1);
            var port = message.readUInt16BE(i + 5);
            var ipStr = ipToStr(ip);
            if (ip !== 0x454f5400) {
                serverListArray.push(ipStr + ':' + port)
            }
        }
        masterclient.close();
        resolve(serverListArray);
    });
    masterclient.on('error', (err) => {
        //console.log(`server error:\n${err.stack}`);
        masterclient.close();
        reject(err)
    });

    // var timeout = setTimeout(function() {
    //     // TODO: If serverList is empty, we should return a timeout error message instead?
    //     masterclient.close();
    //     resolve(serverListArray);
        
    // }, options.timeout);
    
  })
}

function CloudWatchMetric(hostname, ip, players) {
    this.Namespace = 'Quake3Quest'
    this.MetricData = [
      { 
        MetricName: 'NumberOfPlayers',
        Dimensions: [
          { 
            Name: 'Hostname',
            Value: hostname
          },
          { 
            Name: 'IP',
            Value: ip
          },
        ],
        Unit: 'Count',
        Value: players || 0
      },
    ]
  }


//TODO I'm in the process of making this an input argument
async function postDataToCloudwatch(metricServers, infoForServers) {
    await Promise.all(metricServers.map(async server => {
        const numOfPlayers = infoForServers.filter(row => row.ip.includes(server.ip)).reduce((acc, server) => (acc + server.humanPlayers), 0)
        if(DEBUG)
            return console.log(`${server.name}: ${numOfPlayers}`)
        else
            return cloudwatch.putMetricData(new CloudWatchMetric(server.name, 'NA', numOfPlayers)).promise()
    }))
}

async function postDataToS3(infoForServers) {
    const historicalTableRows = infoForServers.map(s => new HistoricalTableRow(s))
    const date = historicalTableRows[0].tstamp.split(' ')[0]
    const time = historicalTableRows[0].tstamp.split(' ')[1]
    if(DEBUG) {
        console.log(date)
        console.log(time)
        console.log(infoForServers) //this goes to S3
        console.log(historicalTableRows) //this goes to S3
        return
    }

    await s3.putObject({
        Bucket: 'q3quest-api',
        Key: 'serverstatus',
        Body: JSON.stringify(infoForServers),
        ContentType: 'application/json',
        StorageClass: 'STANDARD'
    }).promise()

    await s3.putObject({
        Bucket: 'q3quest-historical-data',
        Key: `servers/dt=${date}/${time}.json`,
        Body: historicalTableRows.map(JSON.stringify).join('\n'),
        ContentType: 'application/json',
        StorageClass: 'STANDARD'
    }).promise()

}

exports.handler = async (event) => {
    try {
        const cloudwatchMetrics = JSON.parse(process.env['CLOUDWATCH_METRICS']) // [{'name':'Global','ip':'.'}]
        const master = process.env['MASTER_IP']
        if(!master) {
            throw('MASTER_IP not set propery')
        }

        var connectedServers = await queryAvailableServers(master, {timeout: 5000 })
        DEBUG && console.log(connectedServers)

        const serverInfoAttempts = await Promise.all(connectedServers.map(async (ip) => {
            const serverStatus = await fetchServerStatus(ip, {timeout: 2500});
            const serverInfo = await fetchServerInfo(ip, {timeout: 2500});
            if(serverStatus.success) {
                return new Server(ip, serverStatus.data, serverInfo.data)
            } else {
                return new Error(ip, serverStatus.data.error)
            }
        }))

        const failures = serverInfoAttempts.filter(s => s.constructor == Error)
        failures.forEach(s => console.log(`fetch for ${s.ip} failed: ${s.error})`))

        const infoForServers =  serverInfoAttempts.filter(s => s.constructor == Server)
        DEBUG && console.log(infoForServers)

        if(infoForServers.length) {
            await postDataToCloudwatch(cloudwatchMetrics, infoForServers)
            await postDataToS3(infoForServers)
        } else {
            console.log('No server info to write')
        }

        return {
            statusCode: 200,
            body: JSON.stringify('SUCCESS')

        }
    }
    catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(error)
        }

    }
}

if (require.main === module) {
	void (async () => console.log(await this.handler()))();
}