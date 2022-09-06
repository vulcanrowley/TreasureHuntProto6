/****************************
 * Module to handle all Socket IO communications server <==> player
 * 
 * Functions
 * This module two major activities - the Lobby and the Game
 * 
 * When a player connects, the server places him in the Lobby page (public/index.HTML) controlled by
 * javascript js/main,js
 * Lobby Functions
 * - display arriving and disconnecting players
 * - enables players to create a game
 * - or join and existing game (max players per game set at 20)
 * When a player selects a game, he transitions to a Phaser Game Scene (DungeonScene)
 * When the game ends the non-winning player is returned to the Lobby page. Winners go to a Reward page
 * Game FUnctions
// sets up server commands to:
// - tell all players that a new player has arrived ("newPlayer")
// --- defines inital player state in the server
// - send list of all players to new client connection
// - relay each player movement to all other("playerMoved") when notified by msg ("playerMovement")
// --- NEEDS ADDITIONAL CHECKS FOR LEGIT MOVEMENT
// - sets timer to automatically decrease all players health on 1 second interval
// - sets up collision responses for:
// --- "jugHit" to deal with gathering food
// --- "treasureHit" to deal with gathering treasure setting player color to GOLD
// --- "combatHit" to deal with player vs player contact
// --- "exitHit" ends game if player hasTreasure is true
 */

// node module includes
var uuid = require('node-uuid');

// include our custom server configuration
var Server = require('./server.js');
var Room = require('./room.js');

// Server Game code maintaining player's states and using socketIO to update clients
/////////////////////////////////////////////////////////////////////////////////
var players = {};  // in-memory database of players


var playerCnt = 0;
var roomNo = 0;
// from Lobby code
var rooms = {};
//var clients = {};

var server = new Server();



// repeating timer to reduce all players health by 1 point every 1 second (final parameters 
// to be set in playtesting)
//  DISABLED DURING DEVELOPMENT
setInterval(()=> {
  if(players && rooms){
    Object.keys(players).forEach( function (id) {
        if(players[id].room != null){// test if in a room
            players[id].health -= 1;
            if(players[id].health< 0){
                players[id].playerStarved = true;
                // tell every client that a player is dead
                //io.emit('playerDisconnected', players[id].playerId);
                //delete players[players[id]];
                //console.log('player [' + players[id].playerId + '] disconnected')
              }
        }
  });
  // send msg to reduce health for all clients
  server.emit('healthUpdate',players);// was io.
 }
},1000)// reduce health for all players once per second



// establishes socket connection and player in-memory tables when new player connects
// room and color not assigned yet
server.on('connection', function (socket) {// was io.
  playerCnt += 1;
  if (playerCnt <30){
    //console.log('player # '+playerCnt+' [' + socket.id + '] connected')
   
    //console.log("color is "+playerColor)
    players[socket.id] = {
      gameRoom: null, // added for Lobby  
      health: 100,
      playerKilled: false,
      playerStarved: false,
      hasTreasure: false,
      x: Math.floor(Math.random() * 150) -55,// initial x position
      y: Math.floor(Math.random() * 150) -55,// initial y position
      playerId: socket.id,
      color: null//playerColor//getPlayerColor()//getRandomColor()// but not gold
    }
    
   
   //socket.emit('currentPlayers', players)// non room version
    // tells existing players that a new player has joined
    //socket.broadcast.emit('newPlayer', players[socket.id])

    socket.emit('update', rooms);// was client
    broadcastDebugMsg(socket.id + ' has joined the server');

  }// end of player count IF

  socket.on('disconnect', function() {   
    var room = findRoomByID(socket.id, rooms);
    
    if(room != null){
        //console.log(" player "+socket.id+" and room deletion candidate "+room.id)
        room.clients.splice(socket.id, 1)
        //console.log("players in room "+room.players.length)
        if(room.clients.length == 0){
            //console.log("room being deleted "+room.id)
            delete rooms[room.id];
        }
        
    server.sockets.emit('update', rooms);

    }else{
        console.log(" no room to delete")
    }

    broadcastDebugMsg(socket.id + ' has disconnected from the server');
    delete players[socket.id];
    server.sockets.emit('playerDisconnected', socket.id) // was io. from original Dungeon
});// end of disconnect

////////////////// room code from Lobby //////////
    // assign new room at server level

    socket.on("newRoom", (arg1, callback) => {
        roomNo++
        //creatNewRoom(roomNo)//(newRoomID)
        if(creatNewRoom(roomNo)){
            
         callback(roomNo);
         }
        //callback({
          //status: "ok"
        //});
      });



    function creatNewRoom(roomID){
        
        rooms[roomID] = new Room(roomID); //, clientID);
        broadcastDebugMsg('new room created '  + roomID);
        server.sockets.emit('update', rooms);
        return true;
    }

    socket.on('join', function(roomID, callback) {
        // join existing room
        //console.log(" in join socket for room "+roomID)
        if (connectClientToRoom(roomID, socket.id)) {//, false)) {
            callback(roomID);
        }
    });

    function connectClientToRoom(roomID, clientID) {
        // if the client is  already connected to a room
        if ( players[clientID].room) {  // clients[clientID].isHost ||
            console.log(" already in a room")
            return false;
        }

        //console.log("in connect client "+clientID)
        socket.join(roomID);
        players[clientID].gameRoom = roomID;
        
        rooms[roomID].addClient(clientID);
                   
        broadcastDebugMsg(clientID + ' has joined room: ' + roomID);

        //update rooms info taht player in roomID
        server.sockets.emit('update', rooms);

        // send room specific socketIO updates
        //console.log("total number of players "+Object.keys(players).length)

        //server.sockets.in(roomID).emit('currentPlayers', players);// .in(roomID)
        server.sockets.to(`${clientID}`).emit('currentPlayers', players);
        //sockets.broadcast.to sends to everyone EXCEPT originator
        socket.to(roomID).emit('newPlayer', players[socket.id])
       

        return true;
    }// end of ConnectClient

    function broadcastDebugMsg(msg) {
        server.sockets.emit('debugMessage', msg);
        }
        
    function findRoomByID(playerID, rooms) {
        var key, room;
        for (key in rooms) {
            if (rooms.hasOwnProperty(key)) {
                room = rooms[key];
                //console.log(" looking at room "+room.id+"with size "+room.clients.length)
                //if (room.hostID === hostID) {
                //    return room;
                //}
                for (var i = 0; i < room.clients.length; i++) {
                    if (room.clients[i] === playerID) {
                        return room;
                    }
                }
            }
        }
        return null;
    }


/////////////////////// Game Functions ///////////////

  socket.on('playerMovement', function (movementData) {
    players[socket.id].x = movementData.x
    players[socket.id].y = movementData.y
    //const targetRoom = players[socket.id].room
    //console.log(socket.id+ " moved "+ movementData.x);
    //Sends msg to all other players that socket.id has moved
    server.sockets.to(players[socket.id].gameRoom).emit('playerMoved', players[socket.id])
  })

  // a player died while carrying the Treasure - tell everyone to reset location to original spot
  socket.on('resetTreasure', function () {
      
    socket.to(players[socket.id].gameRoom).emit('replaceTreasure', players)
  })

  // When player encounters a jug, increase health on server and tell all clients that jug is gone
  socket.on('jugHit', function (jug) {
    players[socket.id].health += 10;
    
    console.log(socket.id+ " health "+ players[socket.id].health);
    socket.to(players[socket.id].room).emit('jugRemoved', jug)
  })

  // When player finds treasure, delete treasure, change player icon to gold, set has Treasure flag
  // which slows down player speed
  socket.on('treasureHit', function (jug) {
    players[socket.id].hasTreasure = true;
    players[socket.id].color = "0xFFFF00";
    console.log(socket.id+ " found treasure ");
    socket.to(players[socket.id].room).emit('treasureFound',{ jug:jug, player:socket.id} ) //socket.broadcast.emit
  })

    // When player touches player, reduce both players by random amount and tell all clients
  socket.on('combatHit', function (fighters) {
   
    // reduce health in both players by random amount in range 0-4
    //console.log(" attacker "+fighters.attacker+" target "+fighters.target)
    players[fighters.attacker].health -= Math.floor(Math.random() * 5)
    
    if(players[fighters.attacker].health<0){
      players[fighters.attacker].playerKilled=true;
      players[fighters.attacker].color = "0x000000"
      // test if carrying treasure
      if(players[fighters.attacker].hasTreasure){
        // give treasure other player
        //console.log(fighters.attacker+" killed and has treasure")
        players[fighters.attacker].hasTreasure= false
        players[fighters.target].hasTreasure = true
        players[fighters.target].color = "0xfafad2"
        
      }// end Treasure check
    }// end attacker check
    
    players[fighters.target].health -= Math.floor(Math.random() * 5)
    
    if(players[fighters.target].health<0){
      players[fighters.target].playerKilled=true;
      players[fighters.target].color = "0x000000"

      if(players[fighters.target].hasTreasure){
        // give treasure other player
        console.log(fighters.target+" killed and had treasure")
        players[fighters.target].hasTreasure= false
        players[fighters.attacker].hasTreasure = true
        players[fighters.attacker].color = "0xfafad2"
        
      }
    }
    //edge conditions
    //  - when both layer die in same combat collision
    //  -- drop treasure at spot? or back at original spot??
    //  - has does melee work?
    server.to(players[socket.id].gameRoom).emit('healthUpdate', players)//socket.broadcast.emit wouldn't update player sending msg
  })

    // When player finds Exit and has treasure, transfer to winner/loser scene and end gane
  socket.on('exitHit', function () {
    //console.log(" in server");
    if(players[socket.id].hasTreasure == true)
      {// declare winner in new screen and end game
        console.log(socket.id+ " took the Treasure - has left the Game ");
        // tell everybody else, game over
        let reasonCode ='lost'
        socket.to(players[socket.id].gameRoom).emit('gameOver',{reason:reasonCode})// means another player escaped with treasure
      };

  })// end of exitHit





})// end of socketIO section

function getRandomColor() {
  // but not gold 0xfafad2; reserved for player carrying treasure

  varColor = '0x' + Math.floor(Math.random() * 16777215).toString(16);
  while(varColor == "0xFFFF00"){
      varColor = '0x' + Math.floor(Math.random() * 16777215).toString(16);
    }
  return varColor;
}
/* 
function getActiveRooms(io) {
    // Convert map into 2D list:
    // ==> [['4ziBKG9XFS06NdtVAAAH', Set(1)], ['room1', Set(2)], ...]
    const arr = Array.from(io.sockets.adapter.rooms);
    // Filter rooms whose name exist in set:
    // ==> [['room1', Set(2)], ['room2', Set(2)]]
    const filtered = arr.filter(room => !room[1].has(room[0]))
    // Return only the room name: 
    // ==> ['room1', 'room2']
    const res = filtered.map(i => i[0]);
    return res;
}

*/