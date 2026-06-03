import { supabase } from './supabase';
import { offlineStorage, QueuedAction } from './offlineStorage';

type SyncListener = (syncing: boolean, queueLength: number) => void;

class SyncManager {
  private syncInProgress = false;
  private listeners: SyncListener[] = [];
  private queueLength = 0;

  addListener(listener: SyncListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.syncInProgress, this.queueLength));
  }

  async syncQueuedActions(): Promise<void> {
    if (this.syncInProgress) return;
    if (!navigator.onLine) return;

    // Check if there's anything to sync first
    const queue = await offlineStorage.getSyncQueue();
    if (queue.length === 0) {
      this.queueLength = 0;
      return;
    }

    this.syncInProgress = true;
    this.queueLength = queue.length;
    this.notifyListeners();

    try {
      for (const action of queue) {
        try {
          await this.processAction(action);
          await offlineStorage.removeFromSyncQueue(action.id);
          this.queueLength--;
          this.notifyListeners();
        } catch (error) {
          console.error('Failed to sync action:', action, error);
        }
      }
    } finally {
      this.syncInProgress = false;
      this.queueLength = 0;
      this.notifyListeners();
    }
  }

  private async processAction(action: QueuedAction): Promise<void> {
    const { type, table, data } = action;

    switch (type) {
      case 'create':
        // Remove offline-specific fields and let the database set timestamps
        const { id, created_at, synced, ...createData } = data;
        await supabase.from(table).insert(createData);
        break;
      case 'update':
        await supabase.from(table).update(data).eq('id', data.id);
        break;
      case 'delete':
        await supabase.from(table).delete().eq('id', data.id);
        break;
    }
  }

  async getQueueLength(): Promise<number> {
    const queue = await offlineStorage.getSyncQueue();
    this.queueLength = queue.length;
    return this.queueLength;
  }

  startAutoSync(): void {
    window.addEventListener('online', () => {
      this.syncQueuedActions();
    });

    setInterval(() => {
      if (navigator.onLine) {
        this.syncQueuedActions();
      }
    }, 30000);

    this.getQueueLength();
  }
}

export const syncManager = new SyncManager();
