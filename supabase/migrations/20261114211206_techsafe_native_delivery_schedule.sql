-- Install a minute scheduler only after the queue exists. Settings default to
-- disabled, no worker URL is set, and existing connection environments remain
-- NULL: scheduling does not activate delivery or adopt a production source.
DO $$
BEGIN
 IF to_regnamespace('cron') IS NULL OR to_regnamespace('net') IS NULL THEN
  RAISE EXCEPTION 'Native delivery scheduling requires existing pg_cron and pg_net extensions';
 END IF;
 PERFORM cron.schedule('techsafe-native-order-delivery','* * * * *','SELECT techsafe_source.run_native_delivery_queue();');
END;
$$;
