import { supabase } from './supabase';
import { offlineStorage, QueuedAction } from './offlineStorage';

type SyncListener = (syncing: boolean, queueLength: number) => void;

function sameCreatedValue(wanted:any,actual:any):boolean {
  if(wanted===actual) return true;
  if(typeof wanted==='number' && typeof actual==='string') return Number(actual)===wanted;
  if(typeof wanted==='string' && typeof actual==='string' && /^\d{4}-\d{2}-\d{2}T/.test(wanted) && /^\d{4}-\d{2}-\d{2}T/.test(actual))
    return Number.isFinite(Date.parse(wanted)) && Date.parse(wanted)===Date.parse(actual);
  if(wanted && actual && typeof wanted==='object' && typeof actual==='object') {
    const keys=Object.keys(wanted);
    return Array.isArray(wanted)===Array.isArray(actual) && keys.length===Object.keys(actual).length
      && keys.every(key=>sameCreatedValue(wanted[key],actual[key]));
  }
  return false;
}

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
    const queue = (await offlineStorage.getSyncQueue()).sort((a,b)=>a.timestamp-b.timestamp);
    if (queue.length === 0) {
      this.queueLength = 0;
      return;
    }

    this.syncInProgress = true;
    this.queueLength = queue.length;
    this.notifyListeners();

    try {
      const blockedRows=new Set<string>();
      for (const action of queue) {
        const {data:{session},error:sessionError}=await supabase.auth.getSession();
        if(sessionError || !session || action.ownerId!==session.user.id) continue;
        const rowKey=`${action.table}:${action.data?.id||action.id}`;
        if(blockedRows.has(rowKey)) continue;
        try {
          await this.processAction(action);
          await offlineStorage.removeFromSyncQueue(action.id);
          this.queueLength--;
          this.notifyListeners();
        } catch (error) {
          blockedRows.add(rowKey);
          console.error('Failed to sync action:', action.id, error);
        }
      }
    } finally {
      this.syncInProgress = false;
      this.queueLength = (await offlineStorage.getSyncQueue()).length;
      this.notifyListeners();
    }
  }

  private async processAction(action: QueuedAction): Promise<void> {
    const { type, table, data } = action;

    let result;
    switch (type) {
      case 'create': {
        // Preserve client IDs: queued follow-up updates and child records reference them.
        const { synced, ...createData } = data;
        result=await supabase.from(table).insert(createData);
        if(result.error?.code==='23505' && createData.id) {
          const existing=await supabase.from(table).select('*').eq('id',createData.id).maybeSingle();
          if(!existing.error && existing.data && Object.entries(createData).filter(([,value])=>value!==undefined).every(([key,value])=>sameCreatedValue(value,existing.data[key]))) {result={error:null};}
        }
        break;
      }
      case 'update':
        result=await supabase.from(table).update(data).eq('id',data.id).select('id');
        if(!result.error && !result.data?.length) throw new Error('Queued update did not find an accessible record');
        break;
      case 'delete':
        result=await supabase.from(table).delete().eq('id',data.id).select('id');
        if(!result.error && !result.data?.length) throw new Error('Queued delete did not find an accessible record');
        break;
      default: throw new Error('Unsupported queued action');
    }
    if(result.error) throw result.error;
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
