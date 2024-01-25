require('dotenv').config();
const uri = process.env.uri;


const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;
const fs = require('fs');
const Leaderboard = require('./models/leaderboard.js');
const app = express();
const port = 6046;
const alphabetLower = "abcdefghijklmnopqrstuvwxyz";

mongoose.connect(uri, {
    useNewUrlParser: true
  }).then((conn) => {
    console.log("CONNECTED!");
    console.log(`Connected to MongoDB at ${conn.connection.host}:${conn.connection.port}`);
  }).catch((err) => {
    console.log(err);
  })


app.use(cors());
app.use(express.json());

app.get('/leaderboard', async (req, res) => {
  console.log("getting leaderboard");
  try {
    const leadership = await Leaderboard.find(
      {shared: false}, 
      {
        _id:1, 
        username:1, 
        score:1
      }).sort({score: -1, submitted_date: -1}).limit(10);
    
    res.status(200).send( leadership );
  } catch (error) {
    console.log({message: error.message});
    res.status(500).send({message: error.message});
  }
});

app.post('/newplayer', async (req, res) => {
  console.log("new player");
  const username = req.body.newplayer;
  console.log(username);
  const data = new Leaderboard({
    "username": username,
  });

  try {
    const savedData = await data.save();
    res.status(200).json({user_id: savedData._id});
  } catch (error) {
    res.status(500).send({message: error.message});
  }

});

app.get('/word/:user_id', async (req, res) => {
  userID = new ObjectId(req.params.user_id);
  try {

    var session_user = await Leaderboard.findOne({_id: userID});


    if (session_user.words_left.length === 0 && session_user.words_guessed.length === 0) {
      var words = [];
      for (var i = 0; i < 10; i++) {
        const word_info = await axios.get('https://random-words-api-by-mcnaveen.vercel.app/word');
        words.push(word_info.data[0]);
      }
      session_user.words_left = words;

    }

    if (session_user.words_left.length === 0 && session_user.words_guessed.length > 0) {
      res.status(200).json({message: "You have guessed all the words!"});
      return;
    }

    if (session_user.guessing_word.includes("_") && session_user.guesses_left > 0) {
      res.status(200).json(
        {
          word: session_user.guessing_word, 
          score: session_user.score, 
          guesses_left: session_user.guesses_left,
          hints_left: session_user.hints_left,
          letters_guessed: session_user.letters_guessed,
          message: "You have not guessed the word yet!"
        });
      return;
    }

    const randomIndex = Math.floor(Math.random() * session_user.words_left.length);

    const word = session_user.words_left[randomIndex].word;

    console.log (session_user.username + ": " + word);
    var send_word = "";

    for (var i = 0; i < word.length; i++) {
      send_word += "_";
    }

    session_user.letters_guessed = "";
    session_user.current_word = word;
    session_user.guessing_word = send_word;
    session_user.guesses_left = 8;
    session_user.hints_left.total = 3;
    session_user.hints_left.definition = 1;
    session_user.hints_left.pop_up = 2;
    session_user.hints_left.used_definition = "";

    const update = await Leaderboard.updateOne({_id: userID}, session_user);

    res.status(200).json({word: send_word, score: session_user.score});

  } catch (error) {
    res.status(500).send({message: error.message});
  }

});
app.get('/make-guess/:user_id/:guess', async (req, res) => {
  userID = new ObjectId(req.params.user_id);
  guess = req.params.guess.toLowerCase();
  try {

    var user = await Leaderboard.findOne({_id: userID});

    if (guess.length != 1) {
      res.status(400).json(
        {
          word: user.guessing_word, 
          score: user.score, 
          guesses_left: user.guesses_left,
          hints_left: user.hints_left,
          letters_guessed: user.letters_guessed,
          message: "Please send only one letter at a time."
        });
      return;
    }
  
    if (!alphabetLower.includes(guess)) {
      res.status(400).json(
        {
          word: user.guessing_word, 
          score: user.score, 
          guesses_left: user.guesses_left,
          hints_left: user.hints_left,
          letters_guessed: user.letters_guessed,
          message: "Please send only letters."
        });
      return;
    }

    var word = user.current_word.toLowerCase();
    var letter = user.letters_guessed;
    var guessed = user.guessing_word;
    var send_word = "";

    if (user.guesses_left <= 0) {
      res.status(400).json({message: "You have no guesses left."});
      return;
    }

    if (guessed === word) {
      res.status(400).json({message: "You already guessed this word."});
      return;
    }

    var found = false;
    var won = false;
    var flag = "right";
    // console.log(user.current_word)

    if (letter.includes(guess)) {
      user.guesses_left -= 1;
      const update = await Leaderboard.updateOne({_id: userID}, user);
      res.status(200).json(
        {
          word: send_word,
          flag: flag,
          letters_guessed: user.letters_guessed,
          score: user.score,
          guesses_left: user.guesses_left,
          hints_left: user.hints_left,
          won: won,
          message: "You already guessed this letter."
        });
      return;
    } else {
      for (var i = 0; i < word.length; i++) {
        if (word[i] == guess) {
          send_word += guess;
          found = true;
        } else {
          send_word += user.guessing_word[i];
        }
      }
      if (word === send_word) {
        won = true;
        user.score += 100;

        
        const worded = user.words_left.find(worded => worded.word === user.current_word);
        const index = user.words_left.indexOf(worded);
        user.words_guessed.push(worded);
        user.words_left.splice(index, 1);
      } else {
        if (!found) {
          user.guesses_left -= 1;
          flag = "wrong";
        }
        user.letters_guessed += guess;
      }
    }

    user.guessing_word = send_word;
    const update = await Leaderboard.updateOne({_id: userID}, user);
    res.status(200).json(
      {
        word: send_word,
        flag: flag,
        letters_guessed: user.letters_guessed,
        score: user.score,
        guesses_left: user.guesses_left,
        hints_left: user.hints_left,
        won: won
      });

  } catch (error) {
    res.status(500).send({message: error.message});
  }

});





app.get('/hint/:user_id/:type', async (req, res) => {

  var type = req.params.type.toLowerCase();
  if (type != "def" && type != "pop") {
    res.status(400).json({message: "Please send proper hint request."});
    return;
  }
  var user_id = new ObjectId(req.params.user_id);
  try {

    var user = await Leaderboard.findOne({_id: user_id});

    if (user.current_word === "") {
      res.status(400).json({message: "Please start a game first."});
      return;
    }

    if (user.hints_left.total <= 0) {
      res.status(400).json({message: "You don't have any hints left."});
      return;
    }

    if (type == "def") {
      if (user.hints_left.definition <= 0) {
        res.status(400).json({message: "You don't have any definition hints left."});
        return;
      }

      const definition = user.words_left.find(worded => worded.word === user.current_word).definition;

      user.hints_left.definition -= 1;
      user.hints_left.total -= 1;
      user.hints_left.used_definition = definition;

      const update = await Leaderboard.updateOne({_id: user_id}, user);
      res.status(200).json({definition: definition});

      return;
    }

    if (type == "pop") {

      if (user.hints_left.pop_up <= 0) {
        res.status(400).json({message: "You don't have any pop-up hints left."});
        return;
      }
      
      var answer = user.current_word.toLowerCase();
      var guessed = user.guessing_word;

      var indices = [];

      for (var i = 0; i < guessed.length; i++) {
        if (guessed[i] == "_") {
          indices.push(i);
        }
      }

      var rand_index = indices[Math.floor(Math.random() * indices.length)];

      var check = [];
      for (var i = 0; i < answer.length; i++) {
        if (answer[i] === answer[rand_index]) {
          check.push(i);
        }
      }

      for (var i = 0; i < check.length; i++) {
        guessed = guessed.substring(0, check[i]) + answer[check[i]] + guessed.substring(check[i] + 1);
      }

      user.letters_guessed += answer[rand_index];

      user.guessing_word = guessed;
      user.hints_left.total -= 1;
      user.hints_left.pop_up -= 1;

      if (guessed === answer) {
        user.score += 100;
        const worded = user.words_left.find(worded => worded.word === user.current_word);
        const index = user.words_left.indexOf(worded);
        user.words_guessed.push(worded);
        user.words_left.splice(index, 1);
        const update = await Leaderboard.updateOne({_id: user_id}, user);
        res.status(200).json({word: guessed, score: user.score, message: "You won!"});
        return;
      }
      const update = await Leaderboard.updateOne({_id: user_id}, user);
      res.status(200).json({word: guessed});
      return;
    }
  } catch (error) {
    res.status(500).send({message: error.message});
  }

});


app.post('/single-game', async (req, res) => {
  const {word, definition} = req.body;

  const shared_user = new Leaderboard({
    username: "Shared",
    words_left: [{word: word, definition: definition}],
    shared: true
  });

  try {
    const saved_user = await shared_user.save();
    

    res.status(200).json({url: saved_user._id});
  } catch (error) {
    res.status(500).send({message: error.message});
  }

});

app.listen(port, () => {
    console.log("Server listening on port " + port);
});
