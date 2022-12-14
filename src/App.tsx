import { Component } from "react";
import "./App.css";
import "remixicon/fonts/remixicon.css";
import {
  ClientMessage,
  ConnectionStatus,
  Hover,
  APIMessage,
  Message,
  ServerMessage,
  User,
  UserStatus,
} from "./types/index";
import Messages from "./components/messages/Messages";
import TextBox from "./components/TextBox";
import Users from "./components/Users";

const SERVER = "wss://minima-server.qucchia0.repl.co";

export type State = {
  user?: User;
  enterName: boolean;
  users: User[];
  messages: Message[];
  connectionStatus: ConnectionStatus;
  scrolledToBottom: boolean;
  hover?: Hover;
  loadedAll: boolean;
  webSocket: WebSocket;
};

const MAX_MESSAGES = 50;

export default class App extends Component<{}, State> {
  constructor(props: {}) {
    super(props);

    function getCookie(name: string): string | undefined {
      return document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + "="))
        ?.split('=')[1];
    }

    // Get session if stored in cookies
    const username = getCookie("username");
    const id = parseInt(getCookie("id") || "0");
    const status =
      parseInt(getCookie("status") || "0") as UserStatus
      || UserStatus.ONLINE;
    const user = username ? { username, id, status } : undefined;

    // Load messages from Storage if stored
    function getMessages(): Message[] {
      const queryString = window.location.search;
      if (queryString === "?clear") {
        console.log("Clearing messages")
        localStorage.setItem("messages", "[]");
        return [];
      }
      
      let messages: Message[];
      try {
        messages = JSON.parse(localStorage.getItem("messages") || "[]")
          .map((messageAPI) => new Message(messageAPI));
      } catch (e) {
        console.log("Invalid local Storage: clearing");
        messages = [];
        localStorage.setItem("messages", "[]");
      }
      return messages;
    }

    this.state = {
      user,
      users: [],
      messages: getMessages(),
      connectionStatus: ConnectionStatus.CONNECTING,
      scrolledToBottom: true,
      loadedAll: false,
      webSocket: new WebSocket(SERVER),
    };
  }

  componentDidMount() {
    this.connect();
  }

  send(message: ClientMessage) {
    this.state.webSocket.send(JSON.stringify(message));
  }

  setUser(user: User) {
    
  }

  getUsers() {
    return (this.state.user ? [this.state.user] : []).concat(this.state.users);
  }
  
  connect() {
    this.state.webSocket.onerror = () => {
      this.setState({ connectionStatus: ConnectionStatus.ERROR });
      this.reconnect();
    }

    this.state.webSocket.onopen = () => {
      // Request messages
      if (this.state.messages.filter((m) => m.sent).length) {
        this.send({
          type: "fetch",
          before: 1e100,
          after: this.state.messages[this.state.messages.length - 1].id
        });
      } else {
        // Some messages have been loaded from storage
        this.send({ type: "fetch", last: true });
      }
      
      this.setState({ connectionStatus: ConnectionStatus.OPEN });
      
      if (this.state.user) {
        this.send({
          type: "user",
          user: this.state.user
        });
      }
    }
    
    this.state.webSocket.onclose = () => {
      this.setState({ connectionStatus: ConnectionStatus.CLOSED });
      this.reconnect();
    }

    this.state.webSocket.onmessage = (event) => {
      const wsMessage = JSON.parse(event.data) as ServerMessage;

      switch (wsMessage.type) {
        case "messages":
          console.log("Received messages");
          let messages = this.state.messages;
          wsMessage.messages.forEach((msg) => {
            if (!messages.find((m) => m.id === msg.id)) {
              messages.push(new Message(msg));
            }
          });
          
          messages = messages.sort((a, b) => a.id - b.id);
          this.setState({ messages });
          
          let storageMessages = messages;
          if (storageMessages.length > MAX_MESSAGES) {
            storageMessages = storageMessages.slice(
              storageMessages.length - MAX_MESSAGES,
              storageMessages.length
            );
          }
          localStorage.setItem("messages", JSON.stringify(storageMessages));
          
          if (wsMessage.start) this.setState({ loadedAll: true });
          break;
        case "users":
          console.log("Received users");
          const users = this.state.users;
          wsMessage.users.forEach((user) => {
            const i = users.findIndex((u) => u.id === user.id);
            if (i === -1) {
              users.push(user);
            } else {
              users[i] = user;
            }
          });
          this.setState({ users });
      }
    }
  }

  reconnect() {
    this.setState({ webSocket: new WebSocket(SERVER) });
    this.connect();
  }
  
  handleLoadMore = () => {
    this.send({ type: "fetch", before: this.state.messages[0].id });
  }
  
  handleSend = (content?: string, options?: { image?: string }) => {
    if (!this.state.user || !this.state.user.username) {
      const id = this.state.user?.id || Date.now();
      const status = UserStatus.ONLINE;
      document.cookie = `username=${content}; SameSite=None; Secure`;
      document.cookie = `id=${id}; SameSite=None; Secure`;
      document.cookie = `status=${status}; SameSite=None; Secure`;
      const user = { id, username: content as string, status }
      this.setState({ user });
      this.send({ type: "user", user });
      return;
    }
    
    const message = new Message({
      content,
      image: options?.image,
      authorId: this.state.user.id,
      id: Date.now(),
      sent: this.state.connectionStatus === ConnectionStatus.OPEN
    });

    if (this.state.connectionStatus === ConnectionStatus.OPEN) {
      this.send({ type: "message", message: message.export() });
    } 
    
    this.setState({ messages: this.state.messages.concat([message]) });
  }

  handleHover = (hover: Hover, h: boolean) => {
    if (h) {
      this.setState({ hover });
    } else if (this.state.hover === hover) {
      this.setState({ hover: undefined });
    }
  }

  handleChangeName = () => this.setState({ enterName: true });

  handleUploadProfilePicture = (imageString: string) => {
    const image = new Image();
    image.addEventListener("load", (imageEvent) => {
      // Resize image
      const canvas = document.createElement('canvas');
      const max_size = 32;
      let width = image.width;
      let height = image.height;
      if (width > height) {
        if (width > max_size) {
          height *= max_size / width;
          width = max_size;
        }
      } else {
        if (height > max_size) {
            width *= max_size / height;
            height = max_size;
        }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      const resizedImage = dataURLToBlob(dataUrl);
      
      const user = this.state.user;
      user.profilePicture = resizedImage;
      this.send({ type: "user", user });
      this.setState({ user });
    })
    image.src = imageString;
  }
  
  render() {
    return (
      <>
        <header>
          <h1>Minima</h1>
        </header>
        <Messages
          messages={this.state.messages}
          user={this.state.user}
          users={this.getUsers()}
          loadedAll={this.state.loadedAll}
          onHover={this.handleHover}
          onLoadMore={this.handleLoadMore}
          hover={this.state.hover}
        />
        <footer>
          {(() => {
            switch(this.state.connectionStatus) {
              case ConnectionStatus.CONNECTING:
                return <p>Connecting...</p>;
              case ConnectionStatus.ERROR:
                return <p>Could not connect</p>;
              case ConnectionStatus.CLOSED:
                return <p>Connection closed. Reconnecting...</p>;
            }
          })()}
          <TextBox
            enterName={!this.state.user || !this.state.user.username}
            onSend={this.handleSend}
            onChangeName={this.handleChangeName}
            onUploadProfilePicture={this.handleUploadProfilePicture}
          />
        </footer>
        <aside>
          <Users users={this.getUsers()} />
        </aside>
      </>
    )
  }
}

///////////////////////////// 80 characters wide ///////////////////////////////
