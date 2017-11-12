

 function getRandomInt(min, max) {
   min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min; //The maximum is exclusive and the minimum is inclusive
}

 function pickRandomProperty(obj) {
          var result;
          var count = 0;
          for (var prop in obj)
              if (Math.random() < 1/++count)
                 result = prop;
          return result;
      }


module.exports = getRandomInt