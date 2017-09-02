let express = require('express');
let app = express();
let server = require('http').Server(app);
let shippo = require('shippo')('shippo_test_9e7a2600b3b9f50c9195402f974f5e6ddfcd0d49');
let fs = require('fs');
let bodyParser = require('body-parser');
let path = require('path');
let http = require('https');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
   extended: true
}));
app.use(express.static(path.join(__dirname, 'public')));


app.get('/', (req, res) => {
   res.sendFile(__dirname + '/index.html');
});

app.post('/shippo', (req, res) => {
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
      shippo.shipment.create({
         "address_from": addressFrom,
         "address_to": addressTo,
         "parcels": [parcel],
         "async": false
      }, function(err, shipment){
         if(err) {
            reject(err);
         }
         //console.log(shipment);
         resolve(shipment);
      });
   }).then(shipment => {
      let rate = shipment.rates[0];

      return shippo.transaction.create({
         "rate": rate.object_id,
         "label_file_type": "PDF",
         "async": false
      }, function(err, transaction) {
         return transaction;
      });
   }).then(transaction => {
      let download = (url, dest, cb) => {
         var file = fs.createWriteStream(dest);
         var request = http.get(url, function(response) {
            response.pipe(file);
            file.on('finish', function() {
               file.close(cb);  // close() is async, call cb after close completes.
            });
         }).on('error', function(err) { // Handle errors
            fs.unlink(dest); // Delete the file async. (But we don't check the result)
            if (cb) cb(err.message);
         });
      };
      download(transaction.label_url, __dirname + '/example.pdf', () => {
         res.redirect('/');
      })
   })
})


server.listen(3000, () => {
   console.log('server start at 3000 port');
})