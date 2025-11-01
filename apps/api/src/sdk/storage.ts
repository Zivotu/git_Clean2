// Thesara Storage SDK wrapper
export class ThesaraStorage {
  private namespace: string;
  private apiBase: string;

  constructor(appId: string, apiBase = 'https://storage.thesara.space') {
    this.namespace = `app_${appId}`;
    this.apiBase = apiBase;
  }

  async get(key: string): Promise<any> {
    const response = await fetch(`${this.apiBase}/storage/${this.namespace}/${key}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Storage get failed: ${response.statusText}`);
    }
    return response.json();
  }

  async set(key: string, value: any): Promise<void> {
    const response = await fetch(`${this.apiBase}/storage/${this.namespace}/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
    if (!response.ok) {
      throw new Error(`Storage set failed: ${response.statusText}`);
    }
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(`${this.apiBase}/storage/${this.namespace}/${key}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Storage delete failed: ${response.statusText}`);
    }
  }

  async list(): Promise<string[]> {
    const response = await fetch(`${this.apiBase}/storage/${this.namespace}`);
    if (!response.ok) {
      throw new Error(`Storage list failed: ${response.statusText}`);
    }
    const data = await response.json();
    return data as string[];
  }
}