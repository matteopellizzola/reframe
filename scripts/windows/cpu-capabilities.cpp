// Compiled without AVX: safe to run before choosing a Whisper CPU build.
#include <intrin.h>
#include <cstdio>
int main() {
    int regs[4];
    __cpuid(regs, 0);
    const int maxLeaf = regs[0];
    if (maxLeaf < 7) { std::puts("baseline"); return 0; }
    __cpuidex(regs, 1, 0);
    // AVX, XSAVE/OSXSAVE, FMA and F16C, plus OS support for saving XMM/YMM.
    const unsigned required = (1u << 20) | (1u << 26) | (1u << 27) | (1u << 28) | (1u << 12) | (1u << 29);
    if ((static_cast<unsigned>(regs[2]) & required) != required || (_xgetbv(0) & 6) != 6) {
        std::puts("baseline"); return 0;
    }
    __cpuidex(regs, 7, 0);
    const unsigned extensions = (1u << 5) | (1u << 8); // AVX2 and BMI2
    std::puts((static_cast<unsigned>(regs[1]) & extensions) == extensions ? "avx2" : "baseline");
}
