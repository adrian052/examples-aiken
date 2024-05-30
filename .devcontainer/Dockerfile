ARG UBUNTU_VERSION=20.04

FROM ubuntu:${UBUNTU_VERSION} as system_deps

ENV DEBIAN_FRONTEND=noninteractive

SHELL ["/bin/bash", "-c"]

# development dependencies
RUN apt-get update -y && apt-get install -y \
  curl \
  git \
  unzip \
  sudo \
  python3 \
  && rm -rf /var/lib/apt/lists/*


RUN groupadd -g 1000 user &&\
  useradd -m -u 1000 -g user -s /bin/bash user &&\
  echo 'user ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers

USER user

# install aikup & aiken
RUN curl -sSfL https://install.aiken-lang.org | bash &&\
  export PATH=$PATH:/home/user/.aiken/bin &&\
  aikup

USER root

RUN mkdir -p /usr/local/share/bash-completion/completions &&\
  /home/user/.aiken/bin/aiken completion bash > /usr/local/share/bash-completion/completions/aiken &&\
  echo "source /usr/local/share/bash-completion/completions/aiken" >> /home/user/.bashrc

USER root

## Insatll the most recent version of node 
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs=20.10.0-1nodesource1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*