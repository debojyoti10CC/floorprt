import Image from 'next/image';
import { brand } from '../lib/brand';

type ArqoLogoProps = {
  variant?: 'light' | 'dark';
  symbolOnly?: boolean;
  size?: number;
  className?: string;
};

export function ArqoLogo({ variant = 'dark', symbolOnly = false, size = 27, className = '' }: ArqoLogoProps) {
  const width = Math.round(size * (191 / 165));

  return (
    <span className={`arqo-logo${symbolOnly ? ' arqo-logo-symbol-only' : ''}${className ? ` ${className}` : ''}`}>
      <Image
        src={variant === 'light' ? brand.logoLight : brand.logo}
        alt={symbolOnly ? 'ARQO' : ''}
        aria-hidden={symbolOnly ? undefined : true}
        width={width}
        height={size}
        priority
      />
      {!symbolOnly && <span>{brand.name}</span>}
    </span>
  );
}
