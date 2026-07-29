-- Enable realtime for messages table so Q&A panel subscriptions fire
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
