import { Users, Radio, LayoutDashboard, NotebookTabs, BarChart3, Globe2, Plane, TowerControl, CalendarDays, Award, FileText, Settings } from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/flights', label: 'My Flights', icon: NotebookTabs },
  { to: '/analytics', label: 'Flight Analytics', icon: BarChart3 },
  { to: '/map', label: 'Routes & Map', icon: Globe2 },
  { to: '/live', label: 'Sim Live', icon: Radio },
  { to: '/aircraft', label: 'Aircraft', icon: Plane },
  { to: '/airports', label: 'Airports', icon: TowerControl },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/achievements', label: 'Achievements', icon: Award },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/reports', label: 'Reports & Export', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;
