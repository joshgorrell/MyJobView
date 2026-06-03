import {
  TrendingUp, Wrench, MapPin, DollarSign, Settings, LayoutDashboard,
  Users, Fish, UserCircle, Network, FileText, RefreshCw, ShoppingCart,
  Briefcase, ClipboardList, Edit3, Package, FolderOpen, CheckSquare,
  Hammer, Award, Calendar, Map, Clock, AlertCircle, Activity,
  Navigation, CreditCard, Wallet, Calculator, BarChart3, Link,
  Shield, Lock, Building, Mail, Plug, User, BookOpen, Lightbulb,
  MessageSquare, Bug, Star, Monitor, Menu, Flag, type LucideIcon,
  Receipt, Layers, Tags, Target, Megaphone, Home, Phone, Globe,
  Truck, Send, Eye, Bell, Zap, Search, Filter, Plus, Minus
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  TrendingUp, Wrench, MapPin, DollarSign, Settings, LayoutDashboard,
  Users, Fish, UserCircle, Network, FileText, RefreshCw, ShoppingCart,
  Briefcase, ClipboardList, Edit3, Package, FolderOpen, CheckSquare,
  Hammer, Award, Calendar, Map, Clock, AlertCircle, Activity,
  Navigation, CreditCard, Wallet, Calculator, BarChart3, Link,
  Shield, Lock, Building, Mail, Plug, User, BookOpen, Lightbulb,
  MessageSquare, Bug, Star, Monitor, Menu, Flag,
  Receipt, Layers, Tags, Target, Megaphone, Home, Phone, Globe,
  Truck, Send, Eye, Bell, Zap, Search, Filter, Plus, Minus,
};

export function getIcon(name: string): LucideIcon | undefined {
  return iconMap[name];
}
