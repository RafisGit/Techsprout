import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, devtools } from 'zustand/middleware';

type OtpState = {
  modalStatus: boolean;
  setModalStatus: (status: string) => void;
};

const useOtpStore = create<OtpState>()(
  devtools(
    persist(
      immer((set) => ({
        modalStatus: false,
        setModalStatus: (status) =>
          set(
            (state) => {
              state.modalStatus = (status === 'open' && true) || (status === 'close' && false);
            },
            false,
            'opt/setModalStatus'
          ),
      })),
      { name: 'otp-storage' }
    ),
    { name: 'Opt Store' }
  )
);

export { useOtpStore };
