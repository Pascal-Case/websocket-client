let socket;
let stompClient;
let accessToken = '';
let chatRoomSubscriptions = {};
let chatRoomUnreadCountSubscription = {};
let currentChatRoomId;
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

    // 일단 로그인 후에 바로 소켓을 연결
    await connectSocket();
  } catch (error) {
    console.error('Login Error:', error);
  }
}

// 문의하기
async function inquiry() {
  try {
    const classId = document.getElementById('classId').value;
    createChatRoom(classId).then((chatRoomId) => {
      console.log('created room id: ', chatRoomId);
      currentChatRoomId = chatRoomId;

      // 채팅방 목록 가져오기
      getChatRoomList();

      // 채팅방 목록 업데이트 구독
      subscribeChatRoomsUnreadCountInfo(myId);

      // 채팅방 구독
      subscribeChatRoom(chatRoomId);

      // 채팅방 정보 가져오기
      joinChatRoom(chatRoomId);
    });
  } catch (error) {
    console.error(' Error:', error);
  }
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

// 채팅방 입장 + 정보 가져오기
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

async function closeChatRoom() {
  console.log('closeChatRoom', currentChatRoomId);
  try {
    await axios.post(
      'http://localhost:8080/api/chatRooms/' + currentChatRoomId + '/close',
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          access: accessToken,
        },
        withCredentials: true,
      }
    );

    unsubscribeChatRoom(currentChatRoomId);
  } catch (error) {
    console.error('Error:', error);
  }
}

async function leaveChatRoom() {
  console.log('leaveChatRoom', currentChatRoomId);
  try {
    await axios.post(
      'http://localhost:8080/api/chatRooms/' + currentChatRoomId + '/leave',
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          access: accessToken,
        },
        withCredentials: true,
      }
    );

    unsubscribeChatRoom(currentChatRoomId);
  } catch (error) {
    console.error('Error:', error);
  }
}

async function connectSocket() {
  return new Promise((resolve, reject) => {
    socket = new SockJS(`http://localhost:8080/CB-websocket?access_token=${accessToken}`);
    stompClient = Stomp.over(socket);

    stompClient.connect(
      {},
      (frame) => {
        console.log('Connected: ' + frame);
        resolve();
      },
      (error) => {
        console.error('Connection error: ', error);
        reject(error);
      }
    );
  });
}

function disconnectSocket() {
  if (stompClient) {
    stompClient.disconnect(
      {
        access: accessToken,
      },
      () => {
        console.log('Disconnected from STOMP server');
      }
    );
  }
}

function subscribeChatRoomsUnreadCountInfo(myId) {
  console.log('채팅방 목록 업데이트 구독');
  console.log('/chatRooms/' + myId + '/unreadCountInfo');

  let subscription = stompClient.subscribe('/chatRooms/' + myId + '/unreadCountInfo', (response) => {
    console.log('채팅방 목록 업데이트!');
    const body = JSON.parse(response.body);
    console.log(body);

    const chatRoomDiv = document.getElementById('chatRoom-' + body.chatRoomId);
    const infoDiv = document.createElement('div');
    infoDiv.textContent = `안읽은 메시지 수 : ${body.unreadMessageCount}, 최근 메시지 : ${body.latestMessage}`;
    chatRoomDiv.appendChild(infoDiv);
  });

  chatRoomUnreadCountSubscription[myId] = subscription;
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
  const messageId = 'message-' + reaeReceipt.chatMessageId;
  const messageElement = document.getElementById(messageId);
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
    myId = chatRooms.userId;
    fillChatRooms('inquiredChatRooms', chatRooms.inquiredChatRoomsChatRooms);
    fillChatRooms('receivedInquiryChatRooms', chatRooms.receivedInquiryChatRoomsChatRooms);

    subscribeChatRoomsUnreadCountInfo(myId);
  } catch (error) {
    console.error('Error joining chat room:', error);
  }
}

function fillChatRooms(divId, chatRooms) {
  const div = document.getElementById(divId);
  chatRooms.forEach((chatRoom) => {
    const unreadCountInfo = chatRoom.unreadCountInfo;
    const chatRoomDiv = document.createElement('div');
    chatRoomDiv.id = 'chatRoom-' + chatRoom.chatRoomId;
    chatRoomDiv.textContent = `채팅방 ID: ${chatRoom.chatRoomId}, 문의한 유저: ${chatRoom.inquiredUserId}, 문의받은 유저: ${chatRoom.tutorUserId}`;
    chatRoomDiv.className = 'chat-room';

    const infoDiv = document.createElement('div');
    infoDiv.textContent = `안읽은 메시지 수 : ${unreadCountInfo.unreadMessageCount}, 최근 메시지 : ${unreadCountInfo.latestMessage}`;
    chatRoomDiv.appendChild(infoDiv);

    chatRoomDiv.addEventListener('click', function () {
      console.log('채팅방 열기');

      currentChatRoomId = chatRoom.chatRoomId;

      subscribeChatRoom(currentChatRoomId);

      joinChatRoom(currentChatRoomId);
    });

    div.appendChild(chatRoomDiv);
  });
}
