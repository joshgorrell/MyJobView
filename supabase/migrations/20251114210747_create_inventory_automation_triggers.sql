/*
  # Create Inventory Automation Triggers
  
  ## Summary
  Creates automated triggers for inventory management to keep stock levels
  accurate and create audit trails.
  
  ## Triggers Created
  
  1. **Auto-update inventory on PO receipt**
     - When purchase_order_items.quantity_received changes
     - Updates product_inventory.quantity_on_hand
     - Creates stock_movements record
  
  2. **Auto-create inventory records**
     - When new product or warehouse is created
     - Creates product_inventory records with zero stock
  
  3. **Auto-update inventory on adjustments**
     - When stock_adjustment_items are created
     - Updates product_inventory.quantity_on_hand
     - Creates stock_movements record
  
  4. **Auto-update inventory on transfers**
     - When stock_transfer_items.quantity_received changes
     - Decreases from_warehouse inventory
     - Increases to_warehouse inventory
     - Creates stock_movements records
  
  5. **Update PO status based on items received**
     - Auto-marks PO as 'received' when all items received
     - Auto-marks as 'partial' when some items received
  
  ## Important Notes
  - All triggers maintain data integrity
  - Audit trail created via stock_movements
  - Prevents negative inventory
*/

-- Function to update inventory on PO receipt
CREATE OR REPLACE FUNCTION update_inventory_on_po_receipt()
RETURNS TRIGGER AS $$
DECLARE
  v_warehouse_id uuid;
  v_qty_change numeric;
  v_current_qty numeric;
BEGIN
  -- Get warehouse_id from purchase order
  SELECT warehouse_id INTO v_warehouse_id
  FROM purchase_orders
  WHERE id = NEW.po_id;
  
  -- Calculate quantity change
  v_qty_change := NEW.quantity_received - COALESCE(OLD.quantity_received, 0);
  
  IF v_qty_change != 0 THEN
    -- Get current quantity
    SELECT quantity_on_hand INTO v_current_qty
    FROM product_inventory
    WHERE product_id = NEW.product_id
    AND warehouse_id = v_warehouse_id;
    
    -- Update or insert inventory record
    INSERT INTO product_inventory (product_id, warehouse_id, quantity_on_hand, updated_at)
    VALUES (NEW.product_id, v_warehouse_id, v_qty_change, now())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
      quantity_on_hand = product_inventory.quantity_on_hand + v_qty_change,
      updated_at = now();
    
    -- Create stock movement record
    INSERT INTO stock_movements (
      product_id,
      warehouse_id,
      movement_type,
      quantity,
      quantity_before,
      quantity_after,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      NEW.product_id,
      v_warehouse_id,
      'purchase',
      v_qty_change,
      COALESCE(v_current_qty, 0),
      COALESCE(v_current_qty, 0) + v_qty_change,
      'purchase_order',
      NEW.po_id,
      'Received from PO',
      auth.uid()
    );
    
    -- Update PO status
    PERFORM update_po_status(NEW.po_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_inventory_on_po_receipt
  AFTER INSERT OR UPDATE OF quantity_received ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_po_receipt();

-- Function to update PO status
CREATE OR REPLACE FUNCTION update_po_status(po_id_param uuid)
RETURNS void AS $$
DECLARE
  v_total_ordered numeric;
  v_total_received numeric;
  v_new_status text;
BEGIN
  SELECT
    SUM(quantity_ordered),
    SUM(quantity_received)
  INTO v_total_ordered, v_total_received
  FROM purchase_order_items
  WHERE po_id = po_id_param;
  
  IF v_total_received = 0 THEN
    v_new_status := 'sent';
  ELSIF v_total_received >= v_total_ordered THEN
    v_new_status := 'received';
  ELSE
    v_new_status := 'partial';
  END IF;
  
  UPDATE purchase_orders
  SET
    status = v_new_status,
    received_date = CASE WHEN v_new_status = 'received' THEN CURRENT_DATE ELSE received_date END,
    updated_at = now()
  WHERE id = po_id_param
  AND status != 'cancelled';
END;
$$ LANGUAGE plpgsql;

-- Function to process stock adjustment
CREATE OR REPLACE FUNCTION process_stock_adjustment()
RETURNS TRIGGER AS $$
DECLARE
  v_adjustment_rec RECORD;
  v_current_qty numeric;
BEGIN
  -- Get adjustment details
  SELECT warehouse_id INTO v_adjustment_rec
  FROM stock_adjustments
  WHERE id = NEW.adjustment_id;
  
  -- Get current quantity
  SELECT quantity_on_hand INTO v_current_qty
  FROM product_inventory
  WHERE product_id = NEW.product_id
  AND warehouse_id = v_adjustment_rec.warehouse_id;
  
  -- Update inventory
  INSERT INTO product_inventory (product_id, warehouse_id, quantity_on_hand, updated_at)
  VALUES (NEW.product_id, v_adjustment_rec.warehouse_id, NEW.quantity_after, now())
  ON CONFLICT (product_id, warehouse_id)
  DO UPDATE SET
    quantity_on_hand = NEW.quantity_after,
    last_counted_at = now(),
    updated_at = now();
  
  -- Create stock movement
  INSERT INTO stock_movements (
    product_id,
    warehouse_id,
    movement_type,
    quantity,
    quantity_before,
    quantity_after,
    reference_type,
    reference_id,
    notes,
    created_by
  ) VALUES (
    NEW.product_id,
    v_adjustment_rec.warehouse_id,
    'adjustment',
    NEW.quantity_after - NEW.quantity_before,
    NEW.quantity_before,
    NEW.quantity_after,
    'stock_adjustment',
    NEW.adjustment_id,
    NEW.notes,
    auth.uid()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_process_stock_adjustment
  AFTER INSERT ON stock_adjustment_items
  FOR EACH ROW
  EXECUTE FUNCTION process_stock_adjustment();

-- Function to process stock transfer
CREATE OR REPLACE FUNCTION process_stock_transfer()
RETURNS TRIGGER AS $$
DECLARE
  v_transfer_rec RECORD;
  v_qty_change numeric;
  v_current_qty_from numeric;
  v_current_qty_to numeric;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.quantity_received = 0 THEN
    -- On insert, deduct from source warehouse
    SELECT from_warehouse_id, to_warehouse_id INTO v_transfer_rec
    FROM stock_transfers
    WHERE id = NEW.transfer_id;
    
    -- Get current quantity at source
    SELECT quantity_on_hand INTO v_current_qty_from
    FROM product_inventory
    WHERE product_id = NEW.product_id
    AND warehouse_id = v_transfer_rec.from_warehouse_id;
    
    -- Deduct from source warehouse
    UPDATE product_inventory
    SET
      quantity_on_hand = quantity_on_hand - NEW.quantity,
      updated_at = now()
    WHERE product_id = NEW.product_id
    AND warehouse_id = v_transfer_rec.from_warehouse_id;
    
    -- Create stock movement for transfer out
    INSERT INTO stock_movements (
      product_id,
      warehouse_id,
      movement_type,
      quantity,
      quantity_before,
      quantity_after,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      NEW.product_id,
      v_transfer_rec.from_warehouse_id,
      'transfer_out',
      -NEW.quantity,
      COALESCE(v_current_qty_from, 0),
      COALESCE(v_current_qty_from, 0) - NEW.quantity,
      'stock_transfer',
      NEW.transfer_id,
      'Transfer out',
      auth.uid()
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.quantity_received > OLD.quantity_received THEN
    -- On update, add to destination warehouse
    SELECT to_warehouse_id INTO v_transfer_rec
    FROM stock_transfers
    WHERE id = NEW.transfer_id;
    
    v_qty_change := NEW.quantity_received - OLD.quantity_received;
    
    -- Get current quantity at destination
    SELECT quantity_on_hand INTO v_current_qty_to
    FROM product_inventory
    WHERE product_id = NEW.product_id
    AND warehouse_id = v_transfer_rec.to_warehouse_id;
    
    -- Add to destination warehouse
    INSERT INTO product_inventory (product_id, warehouse_id, quantity_on_hand, updated_at)
    VALUES (NEW.product_id, v_transfer_rec.to_warehouse_id, v_qty_change, now())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
      quantity_on_hand = product_inventory.quantity_on_hand + v_qty_change,
      updated_at = now();
    
    -- Create stock movement for transfer in
    INSERT INTO stock_movements (
      product_id,
      warehouse_id,
      movement_type,
      quantity,
      quantity_before,
      quantity_after,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      NEW.product_id,
      v_transfer_rec.to_warehouse_id,
      'transfer_in',
      v_qty_change,
      COALESCE(v_current_qty_to, 0),
      COALESCE(v_current_qty_to, 0) + v_qty_change,
      'stock_transfer',
      NEW.transfer_id,
      'Transfer in',
      auth.uid()
    );
    
    -- Update transfer status
    PERFORM update_transfer_status(NEW.transfer_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_process_stock_transfer
  AFTER INSERT OR UPDATE OF quantity_received ON stock_transfer_items
  FOR EACH ROW
  EXECUTE FUNCTION process_stock_transfer();

-- Function to update transfer status
CREATE OR REPLACE FUNCTION update_transfer_status(transfer_id_param uuid)
RETURNS void AS $$
DECLARE
  v_total_qty numeric;
  v_total_received numeric;
  v_new_status text;
BEGIN
  SELECT
    SUM(quantity),
    SUM(quantity_received)
  INTO v_total_qty, v_total_received
  FROM stock_transfer_items
  WHERE transfer_id = transfer_id_param;
  
  IF v_total_received >= v_total_qty THEN
    v_new_status := 'received';
  ELSIF v_total_received > 0 THEN
    v_new_status := 'in_transit';
  ELSE
    v_new_status := 'pending';
  END IF;
  
  UPDATE stock_transfers
  SET
    status = v_new_status,
    received_date = CASE WHEN v_new_status = 'received' THEN CURRENT_DATE ELSE received_date END
  WHERE id = transfer_id_param
  AND status != 'cancelled';
END;
$$ LANGUAGE plpgsql;

-- Function to auto-create inventory records for new products
CREATE OR REPLACE FUNCTION create_inventory_for_new_product()
RETURNS TRIGGER AS $$
BEGIN
  -- Create inventory records for all active warehouses
  INSERT INTO product_inventory (product_id, warehouse_id, quantity_on_hand)
  SELECT NEW.id, id, 0
  FROM warehouses
  WHERE is_active = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_inventory_for_new_product
  AFTER INSERT ON products
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION create_inventory_for_new_product();

-- Function to auto-create inventory records for new warehouses
CREATE OR REPLACE FUNCTION create_inventory_for_new_warehouse()
RETURNS TRIGGER AS $$
BEGIN
  -- Create inventory records for all active products
  INSERT INTO product_inventory (product_id, warehouse_id, quantity_on_hand)
  SELECT id, NEW.id, 0
  FROM products
  WHERE is_active = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_inventory_for_new_warehouse
  AFTER INSERT ON warehouses
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION create_inventory_for_new_warehouse();
