import { supabase } from './supabase';

interface NotificationOptions {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'high' | 'normal';
}

export async function sendTechNotification(options: NotificationOptions) {
  try {
    const { data: pushSubs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', options.userId)
      .eq('is_active', true);

    if (subsError) throw subsError;

    if (!pushSubs || pushSubs.length === 0) {
      console.log('No active push subscriptions for user:', options.userId);
      return { success: false, reason: 'no_subscriptions' };
    }

    const notificationPayload = {
      title: options.title,
      body: options.body,
      data: options.data || {},
      priority: options.priority || 'high'
    };

    for (const sub of pushSubs) {
      try {
        const { error: invokeError } = await supabase.functions.invoke('send-push-notification', {
          body: {
            subscription: sub.subscription_data,
            notification: notificationPayload
          }
        });

        if (invokeError) {
          console.error('Error sending push notification:', invokeError);
        }
      } catch (err) {
        console.error('Error invoking notification function:', err);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error in sendTechNotification:', error);
    return { success: false, error };
  }
}

export async function notifyTechJobAssigned(techId: string, workOrderData: {
  work_order_number: string;
  title: string;
  customer_name?: string;
  scheduled_date?: string;
  address?: string;
}) {
  return sendTechNotification({
    userId: techId,
    title: '🚨 New Job Assigned',
    body: `${workOrderData.work_order_number}: ${workOrderData.title}`,
    data: {
      type: 'job_assigned',
      work_order_number: workOrderData.work_order_number,
      customer: workOrderData.customer_name,
      date: workOrderData.scheduled_date,
      address: workOrderData.address
    },
    priority: 'high'
  });
}

export async function notifyTechJobUpdated(techId: string, workOrderData: {
  work_order_number: string;
  title: string;
  changeDescription: string;
}) {
  return sendTechNotification({
    userId: techId,
    title: '📝 Job Updated',
    body: `${workOrderData.work_order_number}: ${workOrderData.changeDescription}`,
    data: {
      type: 'job_updated',
      work_order_number: workOrderData.work_order_number,
      change: workOrderData.changeDescription
    },
    priority: 'normal'
  });
}

export async function notifyTechJobCancelled(techId: string, workOrderData: {
  work_order_number: string;
  title: string;
  reason?: string;
}) {
  return sendTechNotification({
    userId: techId,
    title: '❌ Job Cancelled',
    body: `${workOrderData.work_order_number} has been cancelled`,
    data: {
      type: 'job_cancelled',
      work_order_number: workOrderData.work_order_number,
      reason: workOrderData.reason
    },
    priority: 'high'
  });
}

export async function notifyTechEmergencyJob(techId: string, workOrderData: {
  work_order_number: string;
  title: string;
  customer_name?: string;
  address?: string;
}) {
  return sendTechNotification({
    userId: techId,
    title: '🚨 EMERGENCY JOB - GO NOW',
    body: `${workOrderData.work_order_number}: ${workOrderData.title}`,
    data: {
      type: 'emergency_job',
      work_order_number: workOrderData.work_order_number,
      customer: workOrderData.customer_name,
      address: workOrderData.address,
      urgent: true
    },
    priority: 'high'
  });
}

export async function notifyTechJobReassigned(techId: string, workOrderData: {
  work_order_number: string;
  title: string;
  previous_tech?: string;
  scheduled_date?: string;
}) {
  return sendTechNotification({
    userId: techId,
    title: '🔄 Job Reassigned to You',
    body: `${workOrderData.work_order_number}: ${workOrderData.title}`,
    data: {
      type: 'job_reassigned',
      work_order_number: workOrderData.work_order_number,
      previous_tech: workOrderData.previous_tech,
      date: workOrderData.scheduled_date
    },
    priority: 'high'
  });
}
