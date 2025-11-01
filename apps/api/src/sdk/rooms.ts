// Thesara Rooms SDK wrapper
export interface RoomOptions {
  maxUsers?: number;
  persistent?: boolean;
  metadata?: Record<string, any>;
}

export interface RoomEvent {
  type: string;
  data: any;
  sender: string;
  timestamp: number;
}

export class ThesaraRooms {
  private appId: string;
  private apiBase: string;
  private rooms: Map<string, WebSocket>;

  constructor(appId: string, apiBase = 'https://api.thesara.space') {
    this.appId = appId;
    this.apiBase = apiBase;
    this.rooms = new Map();
  }

  async createRoom(roomId: string, options: RoomOptions = {}): Promise<void> {
    const response = await fetch(`${this.apiBase}/rooms/${this.appId}/${roomId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });
    if (!response.ok) {
      throw new Error(`Create room failed: ${response.statusText}`);
    }
  }

  joinRoom(roomId: string, onMessage: (event: RoomEvent) => void): void {
    if (this.rooms.has(roomId)) {
      throw new Error(`Already joined room ${roomId}`);
    }

    const ws = new WebSocket(`${this.apiBase.replace('http', 'ws')}/rooms/${this.appId}/${roomId}/ws`);
    
    ws.onmessage = (event) => {
      try {
        const roomEvent = JSON.parse(event.data) as RoomEvent;
        onMessage(roomEvent);
      } catch (err) {
        console.error('Failed to parse room event:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('Room WebSocket error:', error);
      this.rooms.delete(roomId);
    };

    ws.onclose = () => {
      this.rooms.delete(roomId);
    };

    this.rooms.set(roomId, ws);
  }

  leaveRoom(roomId: string): void {
    const ws = this.rooms.get(roomId);
    if (ws) {
      ws.close();
      this.rooms.delete(roomId);
    }
  }

  sendMessage(roomId: string, type: string, data: any): void {
    const ws = this.rooms.get(roomId);
    if (!ws) {
      throw new Error(`Not connected to room ${roomId}`);
    }

    ws.send(JSON.stringify({ type, data }));
  }

  async listRooms(): Promise<string[]> {
    const response = await fetch(`${this.apiBase}/rooms/${this.appId}`);
    if (!response.ok) {
      throw new Error(`List rooms failed: ${response.statusText}`);
    }
    return response.json() as Promise<string[]>;
  }

  async getRoomInfo(roomId: string): Promise<{ users: number; metadata: Record<string, any> }> {
    const response = await fetch(`${this.apiBase}/rooms/${this.appId}/${roomId}/info`);
    if (!response.ok) {
      throw new Error(`Get room info failed: ${response.statusText}`);
    }
    return response.json() as Promise<{ users: number; metadata: Record<string, any> }>;
  }
}