CREATE OR REPLACE FUNCTION public.redeem_reward_atomic(p_reward_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_balance integer;
  v_reward public.rewards_catalog%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT points_earned INTO v_balance FROM public.profiles
  WHERE id = v_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT * INTO v_reward FROM public.rewards_catalog
  WHERE id = p_reward_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_reward.available,false) THEN
    RAISE EXCEPTION 'Reward unavailable';
  END IF;
  IF v_reward.points_cost IS NULL OR v_reward.points_cost <= 0 THEN
    RAISE EXCEPTION 'Invalid reward cost';
  END IF;
  IF COALESCE(v_balance,0) < v_reward.points_cost THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;
  IF v_reward.stock_quantity IS NOT NULL AND v_reward.stock_quantity <= 0 THEN
    RAISE EXCEPTION 'Reward out of stock';
  END IF;
  INSERT INTO public.reward_redemptions(user_id,reward_id,points_spent,status)
  VALUES (v_actor,p_reward_id,v_reward.points_cost,'pending');
  INSERT INTO public.points_transactions(user_id,points_amount,transaction_type,reference_id,description)
  VALUES (v_actor,-v_reward.points_cost,'reward_redemption',p_reward_id,'Redeemed: '||v_reward.name);
  IF v_reward.stock_quantity IS NOT NULL THEN
    UPDATE public.rewards_catalog SET stock_quantity=stock_quantity-1 WHERE id=p_reward_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_reward_atomic(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.redeem_reward_atomic(uuid) TO authenticated;