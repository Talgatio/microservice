var express = require('express');
var app = express();
var server = require('http').Server(app);
var shippo = require('shippo')('shippo_test_9e7a2600b3b9f50c9195402f974f5e6ddfcd0d49');
var fs = require('fs');
var bodyParser = require('body-parser');
var path = require('path');
var http = require('https');
var AWS = require('aws-sdk');
var process = require('process');
var Consumer = require('sqs-consumer');
var crypto = require('crypto');

AWS.config.update({
   accessKeyId: process.env.API_KEY,
   secretAccessKey: process.env.SECRET_KEY,
   "region": "us-west-2"
});

var sqs = new AWS.SQS({apiVersion: '2012-11-05'});
var s3bucket = new AWS.S3({params: {Bucket: 'amberity-sandbox', ARN: 'arn:aws:s3:::amberity-sandbox'}});

const cons = Consumer.create({
   queueUrl: 'https://sqs.us-west-2.amazonaws.com/423136339728/amberity-sandbox.fifo',
   handleMessage: (message, done) => {
      console.log(message);
      done();
   },
   sqs: new AWS.SQS()
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
   extended: true
}));
app.use(express.static(path.join(__dirname, 'public')));


app.get('/', (req, res) => {
   res.sendFile(__dirname + '/index.html');
});

app.post('/sendMessageToSqs', (req, res) => {
   let body = req.body;
   let addressTo = {
      "name": body.toName,
      "street1": body.toStreet,
      "city": body.toCity,
      "state": body.toState,
      "zip": body.toZip,
      "country": body.toCountry,
      "phone": body.toPhone,
      "email": body.toEmail
   };
   let addressFrom = {
      "name": body.fromName,
      "street1": body.fromStreet,
      "city": body.fromCity,
      "state": body.fromState,
      "zip": body.fromZip,
      "country": body.fromCountry,
      "phone": body.fromPhone,
      "email": body.fromEmail
   };
   let parcel = {
      "length": body.length,
      "width": body.width,
      "height": body.height,
      "distance_unit": body.distance_unit,
      "weight": body.weight,
      "mass_unit": body.mass_unit
   };
   
   return new Promise((resolve, reject) => {
      let msg = {
         addressTo: addressTo,
         addressFrom: addressFrom,
         parcel: parcel
      }
      let sqsParams = {
         MessageBody: JSON.stringify(msg),
         QueueUrl: 'https://sqs.us-west-2.amazonaws.com/423136339728/amberity-sandbox.fifo',
         MessageGroupId: (Math.random()*1500).toString(),
         MessageDeduplicationId: crypto.createHash('md5').update((Math.random()*1500).toString()).digest("base64")
      };
      sqs.sendMessage(sqsParams, (err, data) => {
         if (err) {
            console.log('ERR', err);
            reject(err);
         }
         resolve(data);
      });
   }).then(data => {
      res.redirect('/');
   })
});


cons.on('error', err => {
   console.log("ERROR");
   console.log(err.message);
});

//EventEmmiter listener for received messages from SQS
cons.on('message_received', message => {
   if(message.Body) {
      let msg = JSON.parse(message.Body);
      return new Promise((resolve, reject) => {
         //Create Shipment
         shippo.shipment.create({
            "address_from": msg.addressFrom,
            "address_to": msg.addressTo,
            "parcels": [msg.parcel],
            "async": false
         }, function(err, shipment){
            if(err) {
               reject(err);
            }
            resolve(shipment);
         });
      }).then(shipment => {
         //Create transaction
         let rate = shipment.rates[0];
         return shippo.transaction.create({
            "rate": rate.object_id,
            "label_file_type": "PDF",
            "async": false
         }, (err, transaction) => {
            return transaction;
         });
      }).then(transaction => {
         //Download files function from remote server
         let download = (url, dest, cb) => {
            var file = fs.createWriteStream(dest);
            var request = http.get(url, (response) => {
               response.pipe(file);
               file.on('finish', () => {
                  file.close(cb);
               });
            }).on('error', err => {
               fs.unlink(dest);
               if (cb) cb(err.message);
            });
         };
         
         //Download PDF file
         download(transaction.label_url, __dirname + '/example.pdf', err => {
            if(err) {
               console.log(err);
               res.status(500).send(err);
            }
         })
      }).then(() => {
         return new Promise((resolve, reject) => {
            fs.readFile(__dirname + '/example.pdf', (err, data) => {
               if (err) {
                  throw err;
               }
               //Upload PDF file ti s3
               return s3bucket.createBucket(() => {
                  var params = {
                     Key: (Math.random()*1000).toString() + '.pdf', //Generate unicue filename
                     Body: data
                  };
                  return s3bucket.upload(params, (err, data) => {
                     fs.unlink(__dirname + '/example.pdf', (err) => {
                        if (err) {
                           console.error(err);
                        }
                     });
                     if (err) {
                        reject(err);
                     } else {
                        console.log(data);
                        resolve(data);
                     }
                  });
               });
            });
         })
      })
   }
});

cons.start();

server.listen(3000, () => {
   console.log('server start at 3000 port');
})