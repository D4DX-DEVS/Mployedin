/**
 * Client-side icon registry for nav items.
 * NavItem.icon is a plain string (serialisable across Server→Client boundary).
 * Resolve it to a Lucide component here, inside Client Components only.
 */
import {
  LayoutDashboard,
  Briefcase,
  Users,
  UserCheck,
  FileText,
  Calendar,
  TrendingUp,
  Settings,
  Shield,
  Map,
  Bell,
  BarChart2,
  ClipboardList,
  Palette,
  Target,
  DollarSign,
  MessageSquare,
  BookOpen,
  Star,
  SlidersHorizontal,
  Globe,
  Activity,
  // New: unique icons for sub-menus
  Clock,
  Building,
  Heart,
  Award,
  GraduationCap,
  ScrollText,
  Sun,
  Layers,
  Wrench,
  Factory,
  UserCircle,
  Grid3x3,
  Milestone,
  Languages,
  Building2,
  UserSearch,
  UserCog,
  MapPin,
  HelpCircle,
  Newspaper,
  Quote,
  Image,
  Video,
  Mail,
  PanelsTopLeft,
  CheckCircle,
  GitBranch,
  FolderOpen,
  Headset,
  type LucideProps,
} from "lucide-react";
import type { FC } from "react";

export type IconName =
  | "LayoutDashboard"
  | "Briefcase"
  | "Users"
  | "UserCheck"
  | "FileText"
  | "Calendar"
  | "TrendingUp"
  | "Settings"
  | "Shield"
  | "Map"
  | "Bell"
  | "BarChart2"
  | "ClipboardList"
  | "Palette"
  | "Target"
  | "DollarSign"
  | "MessageSquare"
  | "BookOpen"
  | "Star"
  | "SlidersHorizontal"
  | "Globe"
  | "Clock"
  | "Building"
  | "Heart"
  | "Award"
  | "GraduationCap"
  | "ScrollText"
  | "Sun"
  | "Layers"
  | "Wrench"
  | "Factory"
  | "UserCircle"
  | "Grid3x3"
  | "Milestone"
  | "Languages"
  | "Building2"
  | "UserSearch"
  | "UserCog"
  | "MapPin"
  | "HelpCircle"
  | "Newspaper"
  | "Quote"
  | "Image"
  | "Video"
  | "Mail"
  | "PanelsTopLeft"
  | "CheckCircle"
  | "GitBranch"
  | "FolderOpen"
  | "Headset"
  | "Activity";

const ICON_MAP: Record<IconName, FC<LucideProps>> = {
  LayoutDashboard,
  Briefcase,
  Users,
  UserCheck,
  FileText,
  Calendar,
  TrendingUp,
  Settings,
  Shield,
  Map,
  Bell,
  BarChart2,
  ClipboardList,
  Palette,
  Target,
  DollarSign,
  MessageSquare,
  BookOpen,
  Star,
  SlidersHorizontal,
  Globe,
  Clock,
  Building,
  Heart,
  Award,
  GraduationCap,
  ScrollText,
  Sun,
  Layers,
  Wrench,
  Factory,
  UserCircle,
  Grid3x3,
  Milestone,
  Languages,
  Building2,
  UserSearch,
  UserCog,
  MapPin,
  HelpCircle,
  Newspaper,
  Quote,
  Image,
  Video,
  Mail,
  PanelsTopLeft,
  CheckCircle,
  GitBranch,
  FolderOpen,
  Headset,
  Activity,
};

/** Resolve an icon name to its Lucide component. Falls back to a square placeholder. */
export function getIcon(name: string): FC<LucideProps> {
  return ICON_MAP[name as IconName] ?? LayoutDashboard;
}
