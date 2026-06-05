import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AboutTab } from '@/components/settings/AboutTab';

describe('AboutTab', () => {
  it('关于页展示 Claw logo 资源', () => {
    render(<AboutTab />);

    expect(screen.getByAltText('Claw')).toHaveAttribute(
      'src',
      '/brand/final/claw-ui-mark.svg',
    );
  });
});
