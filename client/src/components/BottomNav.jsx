import { NavLink } from 'react-router-dom';
import { t } from '../data/strings.js';

export default function BottomNav({ lang, feedBadge = 0 }) {
  const items = [
    { to: '/feed',         labelKey: 'nav_feed',    emoji: '🏠', badge: feedBadge },
    { to: '/applications', labelKey: 'nav_apps',    emoji: '📄', badge: 0 },
    { to: '/profile',      labelKey: 'nav_profile', emoji: '👤', badge: 0 },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-100 z-40">
      <div className="max-w-lg mx-auto grid grid-cols-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 !min-h-0 text-xs transition-colors ${
                isActive ? 'text-brand-green font-bold' : 'text-brand-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`relative text-xl transition-transform ${isActive ? 'scale-110' : ''}`}>
                  {item.emoji}
                  {item.badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </span>
                <span>{t(item.labelKey, lang)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
