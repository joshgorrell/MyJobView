/*\n  # Add Org-Scoped RLS + Drop Legacy Policies - Batch 2\n\n  1. Changes\n    - Proposal-related child tables\n    - Security contract child tables\n    - Inventory/warehouse tables\n    - Subscription/recurring tables\n    - Product child tables\n\n  2. Affected Tables\n    - proposal_activity, proposal_messages, proposal_classes, proposal_class_templates\n    - proposal_area_templates, proposal_reactivation_requests, proposal_settings, proposal_versions\n    - security_contract_services, security_contract_templates, security_contract_fields\n    - security_contract_equipment, security_contract_emergency_contacts\n    - security_contract_responses, security_contract_approvals\n    - product_accessories, product_colors, product_packages, product_package_items\n    - product_inventory, product_request_settings\n    - recurring_subscriptions, recurring_invoices, subscription_line_items, subscription_payments\n    - invoice_line_items\n\n  3. Security\n    - All access scoped by organization_id = get_user_org_id()\n*/\n\n-- =============================================\n-- PROPOSAL ACTIVITY\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view proposal activity" ON proposal_activity

\n\nCREATE POLICY "proposal_activity_select_same_org" ON proposal_activity FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_activity_insert_same_org" ON proposal_activity FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PROPOSAL MESSAGES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view proposal messages" ON proposal_messages

\n\nCREATE POLICY "proposal_messages_select_same_org" ON proposal_messages FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_messages_insert_same_org" ON proposal_messages FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_messages_update_same_org" ON proposal_messages FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PROPOSAL CLASSES\n-- =============================================\nDROP POLICY IF EXISTS "Users can view all classes" ON proposal_classes

\n\nCREATE POLICY "proposal_classes_select_same_org" ON proposal_classes FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_classes_insert_same_org" ON proposal_classes FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_classes_update_same_org" ON proposal_classes FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_classes_delete_same_org" ON proposal_classes FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PROPOSAL CLASS TEMPLATES\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view class templates" ON proposal_class_templates

\n\nCREATE POLICY "proposal_class_templates_select_same_org" ON proposal_class_templates FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_class_templates_insert_same_org" ON proposal_class_templates FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_class_templates_update_same_org" ON proposal_class_templates FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_class_templates_delete_same_org" ON proposal_class_templates FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PROPOSAL AREA TEMPLATES\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view area templates" ON proposal_area_templates

\n\nCREATE POLICY "proposal_area_templates_select_same_org" ON proposal_area_templates FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_area_templates_insert_same_org" ON proposal_area_templates FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_area_templates_update_same_org" ON proposal_area_templates FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_area_templates_delete_same_org" ON proposal_area_templates FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PROPOSAL REACTIVATION REQUESTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view reactivation requests" ON proposal_reactivation_requests

\nDROP POLICY IF EXISTS "Authenticated users can update reactivation requests" ON proposal_reactivation_requests

\n\nCREATE POLICY "proposal_reactivation_requests_select_same_org" ON proposal_reactivation_requests FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_reactivation_requests_insert_same_org" ON proposal_reactivation_requests FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_reactivation_requests_update_same_org" ON proposal_reactivation_requests FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PROPOSAL SETTINGS\n-- =============================================\nDROP POLICY IF EXISTS "Sales users can manage proposal settings" ON proposal_settings

\nDROP POLICY IF EXISTS "Users can view proposal settings from their company" ON proposal_settings

\n\nCREATE POLICY "proposal_settings_select_same_org" ON proposal_settings FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_settings_insert_same_org" ON proposal_settings FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_settings_update_same_org" ON proposal_settings FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_settings_delete_same_org" ON proposal_settings FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PROPOSAL VERSIONS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view proposal versions" ON proposal_versions

\nDROP POLICY IF EXISTS "Users can create proposal versions" ON proposal_versions

\n\nCREATE POLICY "proposal_versions_select_same_org" ON proposal_versions FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "proposal_versions_insert_same_org" ON proposal_versions FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SECURITY CONTRACT SERVICES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view services" ON security_contract_services

\nDROP POLICY IF EXISTS "Authenticated users can insert services" ON security_contract_services

\nDROP POLICY IF EXISTS "Authenticated users can update services" ON security_contract_services

\nDROP POLICY IF EXISTS "Authenticated users can delete services" ON security_contract_services

\n\nCREATE POLICY "security_contract_services_select_same_org" ON security_contract_services FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_services_insert_same_org" ON security_contract_services FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_services_update_same_org" ON security_contract_services FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_services_delete_same_org" ON security_contract_services FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SECURITY CONTRACT TEMPLATES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view templates" ON security_contract_templates

\n\nCREATE POLICY "security_contract_templates_select_same_org" ON security_contract_templates FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_templates_insert_same_org" ON security_contract_templates FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_templates_update_same_org" ON security_contract_templates FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_templates_delete_same_org" ON security_contract_templates FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SECURITY CONTRACT FIELDS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view fields" ON security_contract_fields

\n\nCREATE POLICY "security_contract_fields_select_same_org" ON security_contract_fields FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_fields_insert_same_org" ON security_contract_fields FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_fields_update_same_org" ON security_contract_fields FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SECURITY CONTRACT EQUIPMENT\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view equipment" ON security_contract_equipment

\nDROP POLICY IF EXISTS "Authenticated users can manage equipment" ON security_contract_equipment

\n\nCREATE POLICY "security_contract_equipment_select_same_org" ON security_contract_equipment FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_equipment_insert_same_org" ON security_contract_equipment FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_equipment_update_same_org" ON security_contract_equipment FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_equipment_delete_same_org" ON security_contract_equipment FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SECURITY CONTRACT EMERGENCY CONTACTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view emergency contacts" ON security_contract_emergency_contacts

\nDROP POLICY IF EXISTS "Authenticated users can manage emergency contacts" ON security_contract_emergency_contacts

\n\nCREATE POLICY "sec_contract_emerg_contacts_select_same_org" ON security_contract_emergency_contacts FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "sec_contract_emerg_contacts_insert_same_org" ON security_contract_emergency_contacts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "sec_contract_emerg_contacts_update_same_org" ON security_contract_emergency_contacts FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "sec_contract_emerg_contacts_delete_same_org" ON security_contract_emergency_contacts FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SECURITY CONTRACT RESPONSES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view responses" ON security_contract_responses

\nDROP POLICY IF EXISTS "Authenticated users can manage responses" ON security_contract_responses

\n\nCREATE POLICY "security_contract_responses_select_same_org" ON security_contract_responses FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_responses_insert_same_org" ON security_contract_responses FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_responses_update_same_org" ON security_contract_responses FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SECURITY CONTRACT APPROVALS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view approvals" ON security_contract_approvals

\n\nCREATE POLICY "security_contract_approvals_select_same_org" ON security_contract_approvals FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "security_contract_approvals_insert_same_org" ON security_contract_approvals FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PRODUCT ACCESSORIES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can manage product accessories" ON product_accessories

\n\nCREATE POLICY "product_accessories_select_same_org" ON product_accessories FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_accessories_insert_same_org" ON product_accessories FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_accessories_update_same_org" ON product_accessories FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_accessories_delete_same_org" ON product_accessories FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PRODUCT COLORS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view colors" ON product_colors

\nDROP POLICY IF EXISTS "Authenticated users can manage colors" ON product_colors

\n\nCREATE POLICY "product_colors_select_same_org" ON product_colors FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_colors_insert_same_org" ON product_colors FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_colors_update_same_org" ON product_colors FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_colors_delete_same_org" ON product_colors FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PRODUCT PACKAGES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can manage packages" ON product_packages

\n\nCREATE POLICY "product_packages_select_same_org" ON product_packages FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_packages_insert_same_org" ON product_packages FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_packages_update_same_org" ON product_packages FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_packages_delete_same_org" ON product_packages FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PRODUCT PACKAGE ITEMS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can manage package items" ON product_package_items

\n\nCREATE POLICY "product_package_items_select_same_org" ON product_package_items FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_package_items_insert_same_org" ON product_package_items FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_package_items_update_same_org" ON product_package_items FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_package_items_delete_same_org" ON product_package_items FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PRODUCT INVENTORY\n-- =============================================\nDROP POLICY IF EXISTS "Users can view inventory" ON product_inventory

\n\nCREATE POLICY "product_inventory_select_same_org" ON product_inventory FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_inventory_insert_same_org" ON product_inventory FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_inventory_update_same_org" ON product_inventory FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- PRODUCT REQUEST SETTINGS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view product request settings" ON product_request_settings

\n\nCREATE POLICY "product_request_settings_select_same_org" ON product_request_settings FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "product_request_settings_insert_same_org" ON product_request_settings FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "product_request_settings_update_same_org" ON product_request_settings FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- RECURRING SUBSCRIPTIONS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can delete subscriptions" ON recurring_subscriptions

\nDROP POLICY IF EXISTS "Authenticated users can update subscriptions" ON recurring_subscriptions

\nDROP POLICY IF EXISTS "Sales can insert subscriptions" ON recurring_subscriptions

\n-- Keep portal policies\n\nCREATE POLICY "recurring_subscriptions_select_same_org" ON recurring_subscriptions FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "recurring_subscriptions_insert_same_org" ON recurring_subscriptions FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "recurring_subscriptions_update_same_org" ON recurring_subscriptions FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "recurring_subscriptions_delete_same_org" ON recurring_subscriptions FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- RECURRING INVOICES\n-- =============================================\nDROP POLICY IF EXISTS "All authenticated users can view recurring invoices" ON recurring_invoices

\nDROP POLICY IF EXISTS "System can update recurring invoices" ON recurring_invoices

\n\nCREATE POLICY "recurring_invoices_select_same_org" ON recurring_invoices FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "recurring_invoices_insert_same_org" ON recurring_invoices FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "recurring_invoices_update_same_org" ON recurring_invoices FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SUBSCRIPTION LINE ITEMS\n-- =============================================\nDROP POLICY IF EXISTS "All authenticated users can view subscription line items" ON subscription_line_items

\nDROP POLICY IF EXISTS "All authenticated users can update subscription line items" ON subscription_line_items

\nDROP POLICY IF EXISTS "All authenticated users can delete subscription line items" ON subscription_line_items

\n\nCREATE POLICY "subscription_line_items_select_same_org" ON subscription_line_items FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "subscription_line_items_insert_same_org" ON subscription_line_items FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "subscription_line_items_update_same_org" ON subscription_line_items FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "subscription_line_items_delete_same_org" ON subscription_line_items FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SUBSCRIPTION PAYMENTS\n-- =============================================\nDROP POLICY IF EXISTS "System can update subscription payments" ON subscription_payments

\nDROP POLICY IF EXISTS "Subscription payments insert" ON subscription_payments

\nDROP POLICY IF EXISTS "System can insert subscription payments" ON subscription_payments

\nDROP POLICY IF EXISTS "Admin subscription payments all" ON subscription_payments

\nDROP POLICY IF EXISTS "Users can view subscription payments" ON subscription_payments

\nDROP POLICY IF EXISTS "Users can view own subscription payments" ON subscription_payments

\n-- Keep anonymous VIP signup insert policy\n\nCREATE POLICY "subscription_payments_select_same_org" ON subscription_payments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "subscription_payments_insert_same_org" ON subscription_payments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "subscription_payments_update_same_org" ON subscription_payments FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- INVOICE LINE ITEMS\n-- =============================================\nDROP POLICY IF EXISTS "Staff can view invoice line items in their company" ON invoice_line_items

\nDROP POLICY IF EXISTS "Staff can create invoice line items in their company" ON invoice_line_items

\nDROP POLICY IF EXISTS "Staff can update invoice line items in their company" ON invoice_line_items

\nDROP POLICY IF EXISTS "Staff can delete invoice line items in their company" ON invoice_line_items

\n-- Keep portal policy\n\nCREATE POLICY "invoice_line_items_select_same_org" ON invoice_line_items FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "invoice_line_items_insert_same_org" ON invoice_line_items FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "invoice_line_items_update_same_org" ON invoice_line_items FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "invoice_line_items_delete_same_org" ON invoice_line_items FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n
