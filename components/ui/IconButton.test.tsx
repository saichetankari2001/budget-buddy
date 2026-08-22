import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('renders the label and calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<IconButton icon={TrashIcon} label="Delete" onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
