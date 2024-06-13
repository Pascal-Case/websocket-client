let socket;
let stompClient;
let accessToken = '';
let chatRoomSubscriptions = {};
let myId;

// 로그인
async function login() {
  let email = document.getElementById('email').value;
  let password = document.getElementById('password').value;

  try {
    const response = await axios.post(
      'http://localhost:8080/api/users/auth/signin',
      {
        email,
        password,
      },
      {
        withCredentials: true,
      }
    );

    console.log(response);
    accessToken = response.headers.access;
    console.log('accessToken : ', accessToken);
    document.getElementById('result').innerText = response.data.message;
  } catch (error) {
    console.error('Login Error:', error);
  }
}

function inquiry() {
  const classId = document.getElementById('classId').value;
  createChatRoom(classId).then((chatRoomId) => {
    console.log('created room id: ', chatRoomId);
    currentChatRoomId = chatRoomId;

    // 소켓 연결
    connectSocket();

    // 채팅방 연결
    connectChatRoom(chatRoomId);

    // 채팅방 정보 가져오기
    joinChatRoom(chatRoomId);
  });
}

// 채팅방 생성
async function createChatRoom(classId) {
  try {
    const response = await axios.post(
      'http://localhost:8080/api/chatRooms',
      { classId },
      {
        headers: {
          'Content-Type': 'application/json',
          access: accessToken,
        },
        withCredentials: true,
      }
    );

    document.getElementById('result2').innerText = response.data.message;

    return response.data.data.chatRoomId;
  } catch (error) {
    console.error('Error creating chat room:', error);
    throw error;
  }
}

// 채팅방 정보 가져오기
async function joinChatRoom(chatRoomId) {
  console.log('joinChatRoom');
  try {
    const response = await axios.get('http://localhost:8080/api/chatRooms/' + chatRoomId + '/join', {
      headers: {
        'Content-Type': 'application/json',
        access: accessToken,
      },
      withCredentials: true,
    });

    const res = response.data;
    console.log(res);

    myId = res.data.senderId;
    const messages = res.data.messages;

    console.log(messages);

    messages.forEach((message) => {
      showMessage(message);
    });
  } catch (error) {
    console.error('Error joining chat room:', error);
  }
}

async function connectSocket() {
  // 연결
  socket = new SockJS(`http://localhost:8080/CB-websocket?access_token=${accessToken}`);
  stompClient = Stomp.over(socket);
}

function connectChatRoom(chatRoomId) {
  // 채팅방 연결
  stompClient.connect({}, (frame) => {
    console.log('Connected: ' + frame);
    subscribeChatRoom(chatRoomId);
  });
}

function subscribeChatRoom(chatRoomId) {
  console.log(`채팅방 ${chatRoomId} 구독`);
  let messageSubscription = stompClient.subscribe('/chatRoom/' + chatRoomId, (response) => {
    console.log('메시지 수신');
    const body = JSON.parse(response.body);
    showMessage(body);
  });

  let readReceiptSubscription = stompClient.subscribe('/read/' + chatRoomId, (response) => {
    console.log('메시지 읽음 처리');
    const body = JSON.parse(response.body);
    const readReceiptList = body.readReceipts;
    console.log(readReceiptList);

    readReceiptList.forEach((receipt) => {
      markMessageAsRead(receipt);
    });
  });

  chatRoomSubscriptions[chatRoomId] = {
    messageSubscription,
    readReceiptSubscription,
  };
}

function unsubscribeChatRoom(chatRoomId) {
  let subscriptions = chatRoomSubscriptions[chatRoomId];
  if (subscriptions) {
    chatRoomSubscriptions.messageSubscription.unsubscribe();
    chatRoomSubscriptions.readReceiptSubscription.unsubscribe();
    delete chatRoomSubscriptions[chatRoomId];
  }
}

function sendMessage() {
  let message = document.getElementById('message-input').value;
  document.getElementById('message-input').value = '';
  stompClient.send(
    '/app/send/' + currentChatRoomId,
    {},
    JSON.stringify({
      message: message,
    })
  );
}
function sendMarkMessage(messageId) {
  console.log('send mark as read ', messageId);
  stompClient.send('/app/read/' + messageId, {}, {});
}
function showMessage(response) {
  const messageContent = response.message;
  const senderId = response.senderId;
  const isRead = response.isRead;

  let messageArea = document.getElementById('message-area');
  let messageElement = document.createElement('p');
  messageElement.id = 'message-' + response.messageId;

  messageElement.style.textAlign = senderId == myId ? 'right' : 'left';
  messageElement.appendChild(document.createTextNode(messageContent));
  if (senderId == myId) {
    messageElement.prepend(document.createTextNode(isRead ? '(읽음)   ' : ''));
  }

  if (senderId != myId && !isRead) {
    sendMarkMessage(response.messageId);
  }

  messageArea.appendChild(messageElement);
}

function markMessageAsRead(reaeReceipt) {
  console.log(reaeReceipt.userId, myId);
  console.table(reaeReceipt);
  if (reaeReceipt.userId == myId) {
    return;
  }
  const messageElement = document.getElementById('message-' + reaeReceipt.messageId);
  if (messageElement) {
    messageElement.prepend(document.createTextNode('(읽음)    '));
  }
}

// 채팅방 목록
async function getChatRoomList() {
  try {
    const response = await axios.get('http://localhost:8080/api/chatRooms', {
      headers: {
        'Content-Type': 'application/json',
        access: accessToken,
      },
      withCredentials: true,
    });

    const chatRooms = response.data.data;
    console.log(chatRooms);

    fillChatRooms('inquiredChatRooms', chatRooms.inquiredChatRoomsChatRooms);
    fillChatRooms('receivedInquiryChatRooms', chatRooms.receivedInquiryChatRoomsChatRooms);
  } catch (error) {
    console.error('Error joining chat room:', error);
  }
}

function fillChatRooms(divId, chatRooms) {
  const div = document.getElementById(divId);
  chatRooms.forEach((chatRoom) => {
    const chatRoomDiv = document.createElement('div');
    chatRoomDiv.textContent = `채팅방 ID: ${chatRoom.chatRoomId}, 문의한 유저: ${chatRoom.inquiredUserId}, 문의받은 유저: ${chatRoom.tutorUserId}`;
    chatRoomDiv.className = 'chat-room';
    chatRoomDiv.addEventListener('click', function () {
      console.log('채팅방 열기');

      currentChatRoomId = chatRoom.chatRoomId;

      if (stompClient == '' || stompClient == null) {
        connectSocket();
      }

      connectChatRoom(currentChatRoomId);

      joinChatRoom(currentChatRoomId);
    });

    div.appendChild(chatRoomDiv);
  });
}
