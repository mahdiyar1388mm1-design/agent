import { initials } from '../utils';

interface AvatarProps {
  name: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: string;
  className?: string;
}

const fallbackColor = (name: string) => {
  const value = name.split('').reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0);
  return `hsl(${value % 360} 58% 54%)`;
};

export function Avatar({ name, color, size = 'md', status, className = '' }: AvatarProps) {
  return (
    <span className={`avatar avatar-${size} ${className}`} style={{ background: color || fallbackColor(name) }} aria-label={name}>
      <span>{initials(name)}</span>
      {status && <i className={`presence-dot presence-${status.toLowerCase().replace(/\s+/g, '-')}`} />}
    </span>
  );
}
