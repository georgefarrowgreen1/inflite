# Argon2

This package uses the unmodified [Argon2 reference implementation](https://github.com/P-H-C/phc-winner-argon2/tree/62358ba2123abd17fccf2a108a301d4b52c01a7c) from release 20190702 under the CC0 1.0 option in [LICENSE-Argon2](LICENSE-Argon2). It builds the portable C implementation with threads disabled because InFlite's password format uses one lane.
